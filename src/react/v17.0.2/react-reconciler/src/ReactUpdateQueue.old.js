/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

// UpdateQueue is a linked list of prioritized updates.
//
// Like fibers, update queues come in pairs: a current queue, which represents
// the visible state of the screen, and a work-in-progress queue, which can be
// mutated and processed asynchronously before it is committed — a form of
// double buffering. If a work-in-progress render is discarded before finishing,
// we create a new work-in-progress by cloning the current queue.
//
// Both queues share a persistent, singly-linked list structure. To schedule an
// update, we append it to the end of both queues. Each queue maintains a
// pointer to first update in the persistent list that hasn't been processed.
// The work-in-progress pointer always has a position equal to or greater than
// the current queue, since we always work on that one. The current queue's
// pointer is only updated during the commit phase, when we swap in the
// work-in-progress.
//
// For example:
//
//   Current pointer:           A - B - C - D - E - F
//   Work-in-progress pointer:              D - E - F
//                                          ^
//                                          The work-in-progress queue has
//                                          processed more updates than current.
//
// The reason we append to both queues is because otherwise we might drop
// updates without ever processing them. For example, if we only add updates to
// the work-in-progress queue, some updates could be lost whenever a work-in
// -progress render restarts by cloning from current. Similarly, if we only add
// updates to the current queue, the updates will be lost whenever an already
// in-progress queue commits and swaps with the current queue. However, by
// adding to both queues, we guarantee that the update will be part of the next
// work-in-progress. (And because the work-in-progress queue becomes the
// current queue once it commits, there's no danger of applying the same
// update twice.)
//
// Prioritization
// --------------
//
// Updates are not sorted by priority, but by insertion; new updates are always
// appended to the end of the list.
//
// The priority is still important, though. When processing the update queue
// during the render phase, only the updates with sufficient priority are
// included in the result. If we skip an update because it has insufficient
// priority, it remains in the queue to be processed later, during a lower
// priority render. Crucially, all updates subsequent to a skipped update also
// remain in the queue *regardless of their priority*. That means high priority
// updates are sometimes processed twice, at two separate priorities. We also
// keep track of a base state, that represents the state before the first
// update in the queue is applied.
//
// For example:
//
//   Given a base state of '', and the following queue of updates
//
//     A1 - B2 - C1 - D2
//
//   where the number indicates the priority, and the update is applied to the
//   previous state by appending a letter, React will process these updates as
//   two separate renders, one per distinct priority level:
//
//   First render, at priority 1:
//     Base state: ''
//     Updates: [A1, C1]
//     Result state: 'AC'
//
//   Second render, at priority 2:
//     Base state: 'A'            <-  The base state does not include C1,
//                                    because B2 was skipped.
//     Updates: [B2, C1, D2]      <-  C1 was rebased on top of B2
//     Result state: 'ABCD'
//
// Because we process updates in insertion order, and rebase high priority
// updates when preceding updates are skipped, the final result is deterministic
// regardless of priority. Intermediate state may vary according to system
// resources, but the final state is always the same.

import type {Fiber, FiberRoot} from './ReactInternalTypes';
import type {Lanes, Lane} from './ReactFiberLane.old';

import {
  NoLane,
  NoLanes,
  isSubsetOfLanes,
  mergeLanes,
  isTransitionLane,
  intersectLanes,
  markRootEntangled,
} from './ReactFiberLane.old';
import {
  enterDisallowedContextReadInDEV,
  exitDisallowedContextReadInDEV,
} from './ReactFiberNewContext.old';
import {Callback, ShouldCapture, DidCapture} from './ReactFiberFlags';

import {debugRenderPhaseSideEffectsForStrictMode} from 'shared/ReactFeatureFlags';

import {StrictLegacyMode} from './ReactTypeOfMode';
import {
  markSkippedUpdateLanes,
  isInterleavedUpdate,
} from './ReactFiberWorkLoop.old';
import {pushInterleavedQueue} from './ReactFiberInterleavedUpdates.old';

import invariant from 'shared/invariant';

import {disableLogs, reenableLogs} from 'shared/ConsolePatchingDev';

export type Update<State> = {|
  // TODO: Temporary field. Will remove this by storing a map of
  // transition -> event time on the root.
  eventTime: number,
  lane: Lane,

  tag: 0 | 1 | 2 | 3,
  payload: any,
  callback: (() => mixed) | null,

  next: Update<State> | null,
|};

export type SharedQueue<State> = {|
  pending: Update<State> | null,
  interleaved: Update<State> | null,
  lanes: Lanes,
|};

export type UpdateQueue<State> = {|
  baseState: State,
  firstBaseUpdate: Update<State> | null,
  lastBaseUpdate: Update<State> | null,
  shared: SharedQueue<State>,
  effects: Array<Update<State>> | null,
|};

export const UpdateState = 0;
export const ReplaceState = 1;
export const ForceUpdate = 2;
export const CaptureUpdate = 3;

// Global state that is reset at the beginning of calling `processUpdateQueue`.
// It should only be read right after calling `processUpdateQueue`, via
// `checkHasForceUpdateAfterProcessing`.
let hasForceUpdate = false;

let didWarnUpdateInsideUpdate;
let currentlyProcessingQueue;
export let resetCurrentlyProcessingQueue;
if (__DEV__) {
  didWarnUpdateInsideUpdate = false;
  currentlyProcessingQueue = null;
  resetCurrentlyProcessingQueue = () => {
    currentlyProcessingQueue = null;
  };
}

// 初始化更新对象
export function initializeUpdateQueue<State>(fiber: Fiber): void {
  
  // 对于HostRoot或者ClassComponent会使用initializeUpdateQueue创建updateQueue，然后将updateQueue挂载到fiber节点上
  // 创建一个更新，并将其挂载到 fiber 节点的 updateQueue 身上
  const queue: UpdateQueue<State> = {
    // 初始值 //初始state，后面会基于这个state，根据Update计算新的state
    baseState: fiber.memoizedState,
    firstBaseUpdate: null,    // Update形成的链表的头
    lastBaseUpdate: null,     // Update形成的链表的尾
    //新产生的update会以单向环状链表保存在shared.pending上，计算state的时候会剪开这个环状链表，
    // 并且连接在			  //lastBaseUpdate后
    shared: {
      pending: null,
      interleaved: null,
      lanes: NoLanes,
    },
    effects: null,
  };
  // 给 fiber对象上 添加一个 updateQueue 
  fiber.updateQueue = queue;
}

// 克隆更新队列
export function cloneUpdateQueue<State>(
  current: Fiber,
  workInProgress: Fiber,
): void {
  //从当前克隆更新队列。除非它已经是一个克隆。 
  // Clone the update queue from current. Unless it's already a clone.
  const queue: UpdateQueue<State> = (workInProgress.updateQueue: any);
  const currentQueue: UpdateQueue<State> = (current.updateQueue: any);
  if (queue === currentQueue) {
    const clone: UpdateQueue<State> = {
      baseState: currentQueue.baseState,
      firstBaseUpdate: currentQueue.firstBaseUpdate,
      lastBaseUpdate: currentQueue.lastBaseUpdate,
      shared: currentQueue.shared,
      effects: currentQueue.effects,
    };
    workInProgress.updateQueue = clone;
  }
}

// 创建一个更新对象 68070.60499998624 , 1 
export function createUpdate(eventTime: number, lane: Lane): Update<*> {
  const update: Update<*> = {
    eventTime,
    lane,

    tag: UpdateState,
    payload: null,
    callback: null,

    next: null,
  };
  return update;
}

// 入队更新
export function enqueueUpdate<State>(
  fiber: Fiber,
  update: Update<State>,
  lane: Lane,
) {
  // 从 fiber 中取到  updateQueue，每个 fiber 对象都会有一个 updateQueue
  // 给 updateQueue 赋 初始值的操作在 当前文件的 initializeUpdateQueue() 方法中
  const updateQueue = fiber.updateQueue;
  if (updateQueue === null) {
    // Only occurs if the fiber has been unmounted.
    return;
  }

  // 从更新队列中 取到 shared
/*   interleaved: null
  lanes: 0
  pending: null */
  const sharedQueue: SharedQueue<State> = (updateQueue: any).shared;

  // 判断是否并发更新，第一次render会进入 else
  if (isInterleavedUpdate(fiber, lane)) {
    const interleaved = sharedQueue.interleaved;
    //这是第一次更新。创建一个循环列表。 
    if (interleaved === null) {
      // This is the first update. Create a circular list.
      update.next = update;

      // 将当前更新push 到并发更新队列中
      // 在当前渲染结束时，此队列的并发更新将传输到挂起队列
      // At the end of the current render, this queue's interleaved updates will 
      // be transfered to the pending queue.
      pushInterleavedQueue(sharedQueue);
    } else {
      update.next = interleaved.next;
      interleaved.next = update;
    }
    sharedQueue.interleaved = update;
  } else {
    
  //   {
  //    eventTime: 3081886.5,
  //    lane: 1,
  //    tag: 0,
  //    payload: {
  //        element: {
  //            key: null,
  //            ref: null,
  //            props: {},
  //            _owner: null
  //         }
  //     },
  //    callback: null,
  //    next: null
  // }

    const pending = sharedQueue.pending;

    // 创建一个循环链表
    // 第一次更新的 pending 是null
    if (pending === null) {
      // This is the first update. Create a circular list. 
      update.next = update;
      // 如果是第一次更新 则数据结构如下
      // sharedQueue.pending = update;  update.next = update; 
    } else {
      update.next = pending.next;
      pending.next = update;
    }
    
    // 将 pending 设置为当前更新，
    // 会同时给 fiber.updateQueue.shared 设置,该值第一次是 null
    sharedQueue.pending = update;
  }

  if (__DEV__) {
    if (
      currentlyProcessingQueue === sharedQueue &&
      !didWarnUpdateInsideUpdate
    ) {
      console.error(
        'An update (setState, replaceState, or forceUpdate) was scheduled ' +
          'from inside an update function. Update functions should be pure, ' +
          'with zero side-effects. Consider using componentDidUpdate or a ' +
          'callback.',
      );
      didWarnUpdateInsideUpdate = true;
    }
  }
}

export function entangleTransitions(root: FiberRoot, fiber: Fiber, lane: Lane) {
  const updateQueue = fiber.updateQueue;
  if (updateQueue === null) {
    // Only occurs if the fiber has been unmounted.
    return;
  }

  const sharedQueue: SharedQueue<mixed> = (updateQueue: any).shared;
  if (isTransitionLane(lane)) {
    let queueLanes = sharedQueue.lanes;

    // If any entangled lanes are no longer pending on the root, then they must
    // have finished. We can remove them from the shared queue, which represents
    // a superset of the actually pending lanes. In some cases we may entangle
    // more than we need to, but that's OK. In fact it's worse if we *don't*
    // entangle when we should.
    queueLanes = intersectLanes(queueLanes, root.pendingLanes);

    // Entangle the new transition lane with the other transition lanes.
    const newQueueLanes = mergeLanes(queueLanes, lane);
    sharedQueue.lanes = newQueueLanes;
    // Even if queue.lanes already include lane, we don't know for certain if
    // the lane finished since the last time we entangled it. So we need to
    // entangle it again, just to be sure.
    markRootEntangled(root, newQueueLanes);
  }
}

export function enqueueCapturedUpdate<State>(
  workInProgress: Fiber,
  capturedUpdate: Update<State>,
) {
  // Captured updates are updates that are thrown by a child during the render
  // phase. They should be discarded if the render is aborted. Therefore,
  // we should only put them on the work-in-progress queue, not the current one.
  let queue: UpdateQueue<State> = (workInProgress.updateQueue: any);

  // Check if the work-in-progress queue is a clone.
  const current = workInProgress.alternate;
  if (current !== null) {
    const currentQueue: UpdateQueue<State> = (current.updateQueue: any);
    if (queue === currentQueue) {
      // The work-in-progress queue is the same as current. This happens when
      // we bail out on a parent fiber that then captures an error thrown by
      // a child. Since we want to append the update only to the work-in
      // -progress queue, we need to clone the updates. We usually clone during
      // processUpdateQueue, but that didn't happen in this case because we
      // skipped over the parent when we bailed out.
      let newFirst = null;
      let newLast = null;
      const firstBaseUpdate = queue.firstBaseUpdate;
      if (firstBaseUpdate !== null) {
        // Loop through the updates and clone them.
        let update = firstBaseUpdate;
        do {
          const clone: Update<State> = {
            eventTime: update.eventTime,
            lane: update.lane,

            tag: update.tag,
            payload: update.payload,
            callback: update.callback,

            next: null,
          };
          if (newLast === null) {
            newFirst = newLast = clone;
          } else {
            newLast.next = clone;
            newLast = clone;
          }
          update = update.next;
        } while (update !== null);

        // Append the captured update the end of the cloned list.
        if (newLast === null) {
          newFirst = newLast = capturedUpdate;
        } else {
          newLast.next = capturedUpdate;
          newLast = capturedUpdate;
        }
      } else {
        // There are no base updates.
        newFirst = newLast = capturedUpdate;
      }
      queue = {
        baseState: currentQueue.baseState,
        firstBaseUpdate: newFirst,
        lastBaseUpdate: newLast,
        shared: currentQueue.shared,
        effects: currentQueue.effects,
      };
      workInProgress.updateQueue = queue;
      return;
    }
  }

  // Append the update to the end of the list.
  const lastBaseUpdate = queue.lastBaseUpdate;
  if (lastBaseUpdate === null) {
    queue.firstBaseUpdate = capturedUpdate;
  } else {
    lastBaseUpdate.next = capturedUpdate;
  }
  queue.lastBaseUpdate = capturedUpdate;
}

// 从更新中获取状态 
function getStateFromUpdate<State>(
  workInProgress: Fiber,
  queue: UpdateQueue<State>,
  update: Update<State>,
  prevState: State,
  nextProps: any,
  instance: any,
): any {
  switch (update.tag) {
    case ReplaceState: {
      const payload = update.payload;
      if (typeof payload === 'function') {
        // Updater function
        if (__DEV__) {
          enterDisallowedContextReadInDEV();
        }
        const nextState = payload.call(instance, prevState, nextProps);
        if (__DEV__) {
          if (
            debugRenderPhaseSideEffectsForStrictMode &&
            workInProgress.mode & StrictLegacyMode
          ) {
            disableLogs();
            try {
              payload.call(instance, prevState, nextProps);
            } finally {
              reenableLogs();
            }
          }
          exitDisallowedContextReadInDEV();
        }
        return nextState;
      }
      // State object
      return payload;
    }
    case CaptureUpdate: {
      workInProgress.flags =
        (workInProgress.flags & ~ShouldCapture) | DidCapture;
    }
    // Intentional fallthrough
    case UpdateState: {     // 更新 state
      const payload = update.payload;
      let partialState;
      if (typeof payload === 'function') {
        // Updater function
        if (__DEV__) {
          enterDisallowedContextReadInDEV();
        }
        partialState = payload.call(instance, prevState, nextProps);
        if (__DEV__) {
          if (
            debugRenderPhaseSideEffectsForStrictMode &&
            workInProgress.mode & StrictLegacyMode
          ) {
            disableLogs();
            try {
              payload.call(instance, prevState, nextProps);
            } finally {
              reenableLogs();
            }
          }
          exitDisallowedContextReadInDEV();
        }
      } else {
        // Partial state object
        partialState = payload;
      }
      if (partialState === null || partialState === undefined) {
        // Null and undefined are treated as no-ops.
        return prevState;
      }
      /* 
        第一次 render 会直接走到这里 将 payload 进行合并
        cache: Map(0) {}
        element: null

        element: {$$typeof: Symbol(react.element)}
       */
      // Merge the partial state and the previous state.
      return Object.assign({}, prevState, partialState);
    }
    case ForceUpdate: {
      hasForceUpdate = true;
      return prevState;
    }
  }
  return prevState;
}

// 计算最新的 state
export function processUpdateQueue<State>(
  workInProgress: Fiber,
  props: any,
  instance: any,
  renderLanes: Lanes,
): void {
  // 这在 ClassComponent 或 HostRoot 上总是非空的
  // 从workInProgress节点上取出updateQueue
  // This is always non-null on a ClassComponent or HostRoot
  const queue: UpdateQueue<State> = (workInProgress.updateQueue: any);

  hasForceUpdate = false;

  if (__DEV__) {
    currentlyProcessingQueue = queue.shared;
  }

  // 取出queue上的baseUpdate队列（下面称遗留的队列），
  // 然后准备接入本次新产生的更新队列（下面称新队列）
  // 都为 null
  let firstBaseUpdate = queue.firstBaseUpdate;
  let lastBaseUpdate = queue.lastBaseUpdate;

  // 取出新队列
  // 检查是否有挂起的更新。 如果是，将它们转移到基本队列。
  // Check if there are pending updates. If so, transfer them to the base queue.
  let pendingQueue = queue.shared.pending;

  // 下面的操作，实际上就是将新队列连接到上次遗留的队列中。
  if (pendingQueue !== null) {
    queue.shared.pending = null;

    // 待处理队列是循环的。 断开 first 和 last 之间的指针，使其成为非圆形。
    // The pending queue is circular. Disconnect the pointer between first
    // and last so that it's non-circular. 
    const lastPendingUpdate = pendingQueue;
    const firstPendingUpdate = lastPendingUpdate.next;  
    
    // 将遗留的队列最后一个元素指向null，实现断开环状链表,然后在尾部接入新队列
    // 第一次 update 为 pendinQueue.next，最后一次更新为pendingQueue，
    // 设置完后，剪断这个环形链表，如果这俩是一致的话，则 两个 next都会被置空
    lastPendingUpdate.next = null;  // 将 lastpending 的 next 置空  
    // 将 pending 的更新插入到 base queue
    // Append pending updates to base queue
    if (lastBaseUpdate === null) {
      // 记录第一次 的update
      firstBaseUpdate = firstPendingUpdate;
    } else {
      // 将遗留的队列中最后一个update的next指向新队列第一个update
      // 完成接入
      lastBaseUpdate.next = firstPendingUpdate;
    }
    // 修改遗留队列的尾部为新队列的尾部
    // 记录最后一次 update
    lastBaseUpdate = lastPendingUpdate;

    // 如果有一个 current 队列，并且它与 base queue 不同，那么我们也需要将更新传输到该队列。 
    // 因为 base queue 是一个没有循环的单向链表，我们可以附加到两个列表并利用结构共享。
    // 拷贝 workInProgress 的 base queue 单向链表

    // TODO: 因为如果本次的渲染被打断，那么下次再重新执行任务的时候，workInProgress节点复制
    // 自current节点，它上面的baseUpdate队列会保有这次的update，保证update不丢失。
    // If there's a current queue, and it's different from the base queue, then
    // we need to transfer the updates to that queue, too. Because the base
    // queue is a singly-linked list with no cycles, we can append to both
    // lists and take advantage of structural sharing.
    // TODO: Pass `current` as argument
    const current = workInProgress.alternate;
    if (current !== null) {
      // This is always non-null on a ClassComponent or HostRoot
      const currentQueue: UpdateQueue<State> = (current.updateQueue: any);
      const currentLastBaseUpdate = currentQueue.lastBaseUpdate;
      if (currentLastBaseUpdate !== lastBaseUpdate) {
        if (currentLastBaseUpdate === null) {
          currentQueue.firstBaseUpdate = firstPendingUpdate;
        } else {
          currentLastBaseUpdate.next = firstPendingUpdate;
        }
        currentQueue.lastBaseUpdate = lastPendingUpdate;
      }
    }
  }
  // 至此，新队列已经合并到遗留队列上，firstBaseUpdate作为
  // 这个新合并的队列，会被循环处理
  //  这些值可能会随着我们处理队列而改变。
  // These values may change as we process the queue.
  if (firstBaseUpdate !== null) {
    // 取到baseState
    // Iterate through the list of updates to compute the result.
    let newState = queue.baseState;
    // 声明newLanes，它会作为本轮更新处理完成的
    // 优先级，最终标记到WIP节点上
    // TODO: Don't need to accumulate this. Instead, we can remove renderLanes
    // from the original lanes.
    let newLanes = NoLanes;

    // 声明newBaseState，注意接下来它被赋值的时机，还有前置条件：
    // 1. 当有优先级被跳过，newBaseState赋值为newState，
    // 也就是queue.baseState
    // 2. 当都处理完成后没有优先级被跳过，newBaseState赋值为
    // 本轮新计算的state，最后更新到queue.baseState上
    let newBaseState = null;

    // 使用newFirstBaseUpdate 和 newLastBaseUpdate 
    // 来表示本次更新产生的的baseUpdate队列，目的是截取现有队列中
    // 第一个被跳过的低优先级update到最后的所有update，最后会被更新到
    // updateQueue的firstBaseUpdate 和 lastBaseUpdate上
    // 作为下次渲染的遗留队列（baseUpdate）
    let newFirstBaseUpdate = null;
    let newLastBaseUpdate = null;

    // 从头开始循环
    let update = firstBaseUpdate;
    do {

      // 取到 更新赛道 和 时间
      const updateLane = update.lane;
      const updateEventTime = update.eventTime;

      // isSubsetOfLanes函数的意义是，判断当前更新的优先级（updateLane）
      // 是否在渲染优先级（renderLanes）中如果不在，那么就说明优先级不足
      if (!isSubsetOfLanes(renderLanes, updateLane)) {
        // Priority is insufficient. Skip this update. If this is the first
        // skipped update, the previous update/state is the new base
        // update/state.
        const clone: Update<State> = {
          eventTime: updateEventTime,
          lane: updateLane,

          tag: update.tag,
          payload: update.payload,
          callback: update.callback,

          next: null,
        };

        // 优先级不足，将update添加到本次的baseUpdate队列中
        if (newLastBaseUpdate === null) {
          newFirstBaseUpdate = newLastBaseUpdate = clone;
          // newBaseState 更新为前一个 update 任务的结果，下一轮
          // 持有新优先级的渲染过程处理更新队列时，将会以它为基础进行计算。
          newBaseState = newState;
        } else {
          // 如果baseUpdate队列中已经有了update，那么将当前的update
          // 追加到队列尾部
          newLastBaseUpdate = newLastBaseUpdate.next = clone;
        }
        /* *
        * newLanes会在最后被赋值到workInProgress.lanes上，而它又最终
        * 会被收集到root.pendingLanes。
        *  再次更新时会从root上的pendingLanes中找出渲染优先级（renderLanes），
        * renderLanes含有本次跳过的优先级，再次进入processUpdateQueue时，
        * update的优先级符合要求，被更新掉，低优先级任务因此被重做
        * */
        // Update the remaining priority in the queue.
        newLanes = mergeLanes(newLanes, updateLane);
      } else {
        // This update does have sufficient priority.
        // 进到这个判断说明现在处理的这个update在优先级不足的update之后，
        // 原因有二：
        // 第一，优先级足够；
        // 第二，newLastBaseUpdate不为null说明已经有优先级不足的update了
        // 然后将这个高优先级放入本次的baseUpdate，实现之前提到的从updateQueue中
        // 截取低优先级update到最后一个update

        if (newLastBaseUpdate !== null) {
          const clone: Update<State> = {
            eventTime: updateEventTime,
            // This update is going to be committed so we never want uncommit
            // it. Using NoLane works because 0 is a subset of all bitmasks, so
            // this will never be skipped by the check above.
            lane: NoLane,

            tag: update.tag,
            payload: update.payload,
            callback: update.callback,

            next: null,
          };
          newLastBaseUpdate = newLastBaseUpdate.next = clone;
        }

        // 获取新状态  // 处理更新，计算出新结果
        // Process this update.
        /* cache: Map(0) {}
        element: $$typeof: Symbol(react.element)
                  key: null
                  props: {}
                  ref: null
                  type: ƒ App()
                  _owner: null */
        // 将 newState.element 设置为 update.payload.element
        newState = getStateFromUpdate(
          workInProgress,
          queue,
          update,
          newState,
          props,
          instance,
        );

        // 这里的callback是setState的第二个参数，属于副作用，
        // 会被放入queue的副作用队列里
        const callback = update.callback;
        if (callback !== null) {
          workInProgress.flags |= Callback;
          const effects = queue.effects;
          if (effects === null) {
            queue.effects = [update];
          } else {
            effects.push(update);
          }
        }
      }
      // 第一次 render 的 next 是 null
      // 移动指针实现遍历
      update = update.next;
      if (update === null) {
        // 已有的队列处理完了，检查一下有没有新进来的，有的话
        // 接在已有队列后边继续处理
        pendingQueue = queue.shared.pending;  // 在上述代码中已置空
        if (pendingQueue === null) {
          // 如果没有等待处理的update，那么跳出循环
          // 说明此次更新已完成 结束循环
          break;
        } else {
          // 如果此时又有了新的update进来，那么将它接入到之前合并好的队列中
          // 更新是从 reducer 内部安排的。将新的 pending更新添加到列表的末尾并继续处理。 
          // An update was scheduled from inside a reducer. 
          // Add the new pending updates to the end of the list and keep processing.
          const lastPendingUpdate = pendingQueue;

          // 故意不健全。待处理的更新形成一个循环列表，但我们在将它们传输到基本队列时解开它们。 

          // Intentionally unsound. Pending updates form a circular list, but we
          // unravel them when transferring them to the base queue.
          const firstPendingUpdate = ((lastPendingUpdate.next: any): Update<State>);
          lastPendingUpdate.next = null;
          update = firstPendingUpdate;
          queue.lastBaseUpdate = lastPendingUpdate;
          queue.shared.pending = null;
        }
      }
    } while (true);
   // 如果没有低优先级的更新，那么新的newBaseState就被赋值为
   // 刚刚计算出来的state
    // 将新的 state 存下来
    if (newLastBaseUpdate === null) {
      /**
        cache: Map(0) {}
        element:  {$$typeof: Symbol(react.element),...}
       */
      newBaseState = newState;
    }
    // 更新到 workInProgress.updateQueue 中
    queue.baseState = ((newBaseState: any): State);
    queue.firstBaseUpdate = newFirstBaseUpdate;
    queue.lastBaseUpdate = newLastBaseUpdate;

    // 交错更新存储在单独的队列中。 我们不会在此渲染期间处理它们，但我们确实需要跟踪剩余的车道。
    
    // Interleaved updates are stored on a separate queue. We aren't going to
    // process them during this render, but we do need to track which lanes
    // are remaining.
    
    // 第一次 render 以下的怕判断都不会进去
    const lastInterleaved = queue.shared.interleaved;
    if (lastInterleaved !== null) {
      let interleaved = lastInterleaved;
      do {
        newLanes = mergeLanes(newLanes, interleaved.lane);
        interleaved = ((interleaved: any).next: Update<State>);
      } while (interleaved !== lastInterleaved);
    } else if (firstBaseUpdate === null) {
      // `queue.lanes` 用于纠缠过渡。 一旦队列为空，我们可以将其设置回零。
      
      // `queue.lanes` is used for entangling transitions. We can set it back to
      // zero once the queue is empty.
      queue.shared.lanes = NoLanes;
    }

    // Set the remaining expiration time to be whatever is remaining in the queue.
    // This should be fine because the only two other things that contribute to
    // expiration time are props and context. We're already in the middle of the
    // begin phase by the time we start processing the queue, so we've already
    // dealt with the props. Context in components that specify
    // shouldComponentUpdate is tricky; but we'll have to account for
    // that regardless.
    markSkippedUpdateLanes(newLanes);
    workInProgress.lanes = newLanes;
    // 将新的 state 设置为 旧的 state
    workInProgress.memoizedState = newState;
  }

  if (__DEV__) {
    currentlyProcessingQueue = null;
  }
}

function callCallback(callback, context) {
  invariant(
    typeof callback === 'function',
    'Invalid argument passed as callback. Expected a function. Instead ' +
      'received: %s',
    callback,
  );
  callback.call(context);
}

export function resetHasForceUpdateBeforeProcessing() {
  hasForceUpdate = false;
}

export function checkHasForceUpdateAfterProcessing(): boolean {
  return hasForceUpdate;
}

export function commitUpdateQueue<State>(
  finishedWork: Fiber,
  finishedQueue: UpdateQueue<State>,
  instance: any,
): void {
  // Commit the effects
  const effects = finishedQueue.effects;
  finishedQueue.effects = null;
  if (effects !== null) {
    for (let i = 0; i < effects.length; i++) {
      const effect = effects[i];
      const callback = effect.callback;
      if (callback !== null) {
        effect.callback = null;
        callCallback(callback, instance);
      }
    }
  }
}
