/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {FiberRoot, SuspenseHydrationCallbacks} from './ReactInternalTypes';
import type {RootTag} from './ReactRootTags';

import {noTimeout, supportsHydration} from './ReactFiberHostConfig';
import {createHostRootFiber} from './ReactFiber.old';
import {
  NoLane,
  NoLanes,
  NoTimestamp,
  TotalLanes,
  createLaneMap,
} from './ReactFiberLane.old';
import {
  enableSuspenseCallback,
  enableCache,
  enableProfilerCommitHooks,
  enableProfilerTimer,
  enableUpdaterTracking,
} from 'shared/ReactFeatureFlags';
import {initializeUpdateQueue} from './ReactUpdateQueue.old';
import {LegacyRoot, ConcurrentRoot} from './ReactRootTags';

// 根节点 fiber 构造函数
function FiberRootNode(containerInfo, tag, hydrate) {
  this.tag = tag;
  this.containerInfo = containerInfo;
  this.pendingChildren = null;

  // 这 current 是 rootFiber，也是整个fiber 的入口
  this.current = null;

  this.pingCache = null;

  // 已经完成的任务的FiberRoot对象，如果你只有一个Root，那他永远只可能是这个Root对应的Fiber，或者是null
  // 在commit阶段只会处理这个值对应的任务
  this.finishedWork = null;      
  this.timeoutHandle = noTimeout;
  this.context = null;
  this.pendingContext = null;
  this.hydrate = hydrate;
  this.callbackNode = null;
  this.callbackPriority = NoLane;
  this.eventTimes = createLaneMap(NoLanes);
  this.expirationTimes = createLaneMap(NoTimestamp);

  this.pendingLanes = NoLanes;
  this.suspendedLanes = NoLanes;
  this.pingedLanes = NoLanes;
  this.expiredLanes = NoLanes;
  this.mutableReadLanes = NoLanes;
  this.finishedLanes = NoLanes;

  this.entangledLanes = NoLanes;
  this.entanglements = createLaneMap(NoLanes);

  if (enableCache) {
    this.pooledCache = null;
    this.pooledCacheLanes = NoLanes;
  }

  if (supportsHydration) {
    this.mutableSourceEagerHydrationData = null;
  }

  if (enableSuspenseCallback) {
    this.hydrationCallbacks = null;
  }

  if (enableProfilerTimer && enableProfilerCommitHooks) {
    this.effectDuration = 0;
    this.passiveEffectDuration = 0;
  }

  if (enableUpdaterTracking) {
    this.memoizedUpdaters = new Set();
    const pendingUpdatersLaneMap = (this.pendingUpdatersLaneMap = []);
    for (let i = 0; i < TotalLanes; i++) {
      pendingUpdatersLaneMap.push(new Set());
    }
  }

  if (__DEV__) {
    switch (tag) {
      case ConcurrentRoot:
        this._debugRootType = 'createRoot()';
        break;
      case LegacyRoot:
        this._debugRootType = 'createLegacyRoot()';
        break;
    }
  }
}

// 调用 createFiberRoot 创建 fiber容器
// 第一次 render 的时候 只有 第一个和第二个参数有值 
export function createFiberRoot(
  containerInfo: any,
  tag: RootTag,
  hydrate: boolean,
  hydrationCallbacks: null | SuspenseHydrationCallbacks,
  strictModeLevelOverride: null | number,
  concurrentUpdatesByDefaultOverride: null | boolean,
): FiberRoot {
  // 创建一个 根fiber 节点
  const root: FiberRoot = (new FiberRootNode(containerInfo, tag, hydrate): any);
  
  if (enableSuspenseCallback) {
    root.hydrationCallbacks = hydrationCallbacks;
  }

  // Cyclic construction. This cheats the type system right now because
  // stateNode is any.
  // 创建一个 fiber 节点 FiberRoot
  const uninitializedFiber = createHostRootFiber(
    tag,
    strictModeLevelOverride,
    concurrentUpdatesByDefaultOverride,
  );
  // 将 fiber 节点挂载到 current 身上 这个就是  FiberRoot
  root.current = uninitializedFiber;

  // 将根节点的 stateNode 设置为 自身
  uninitializedFiber.stateNode = root;

  // 启用缓存
  if (enableCache) {
    const initialCache = new Map();
    root.pooledCache = initialCache;
    const initialState = {
      element: null,
      cache: initialCache,
    };
    uninitializedFiber.memoizedState = initialState;
  } else {
    const initialState = {
      element: null,
    };

    // 上一次的 state 
    uninitializedFiber.memoizedState = initialState;
  }

  // 创建一个更新，将当前 fiber 传进去
  initializeUpdateQueue(uninitializedFiber);

  return root;
}
