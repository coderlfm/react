/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {Wakeable, Thenable} from 'shared/ReactTypes';

import {REACT_LAZY_TYPE} from 'shared/ReactSymbols';

const Uninitialized = -1;
const Pending = 0;
const Resolved = 1;
const Rejected = 2;

type UninitializedPayload<T> = {
  _status: -1,
  _result: () => Thenable<{default: T, ...}>,
};

type PendingPayload = {
  _status: 0,
  _result: Wakeable,
};

type ResolvedPayload<T> = {
  _status: 1,
  _result: T,
};

type RejectedPayload = {
  _status: 2,
  _result: mixed,
};

type Payload<T> =
  | UninitializedPayload<T>
  | PendingPayload
  | ResolvedPayload<T>
  | RejectedPayload;

export type LazyComponent<T, P> = {
  $$typeof: Symbol | number,
  _payload: P,
  _init: (payload: P) => T,
};

// 异步加载模块
function lazyInitializer<T>(payload: Payload<T>): T {

  // 如果当前未初始化
  if (payload._status === Uninitialized) {
    const ctor = payload._result;
    const thenable = ctor();
    // Transition to the next state. //转换到下一个状态。 (pending)
    const pending: PendingPayload = (payload: any);
    pending._status = Pending;
    pending._result = thenable;

    // 调用 .then 拿到模块对象
    thenable.then(
      // 成功的回调
      moduleObject => {

        // 如果处于 pending 状态，则取到模块对象导出的 default 对象
        if (payload._status === Pending) {
          const defaultExport = moduleObject.default;
          if (__DEV__) {
            // 如果没有默认导出则报错
            if (defaultExport === undefined) {
              console.error(
                'lazy: Expected the result of a dynamic import() call. ' +
                  'Instead received: %s\n\nYour code should look like: \n  ' +
                  // Break up imports to avoid accidentally parsing them as dependencies.
                  'const MyComponent = lazy(() => imp' +
                  "ort('./MyComponent'))",
                moduleObject,
              );
            }
          }

          // Transition to the next state. //转换到下一个状态。 (resolved) 成功
          const resolved: ResolvedPayload<T> = (payload: any);
          resolved._status = Resolved;
          resolved._result = defaultExport;
        }
      },
      // 错误的回调
      error => {
        if (payload._status === Pending) {
          
          // Transition to the next state. //转换到下一个状态。 (rejected) 失败
          const rejected: RejectedPayload = (payload: any);
          rejected._status = Rejected;
          rejected._result = error;
        }
      },
    );
  }
  // 如果之前已经加载过，则直接返回结果
  if (payload._status === Resolved) {
    return payload._result;
  } else {
    throw payload._result;
  }
}

// lazy 接收一个函数，返回 LazyComponent ,这个 LazyComponent 是一个 promise
export function lazy<T>(
  ctor: () => Thenable<{default: T, ...}>,
): LazyComponent<T, Payload<T>> {
  
  // _status 是当前异步组件的状态，pengdding 、成功、失败的状态会随之变化
  /*   
    const Uninitialized = -1;
    const Pending = 0;
    const Resolved = 1;
    const Rejected = 2; 
  */

  // _result 是当前组件的异步加载结果，如果这个组件之前加载过，则直接使用 _result，在上处 lazyInitializer() 函数有体现
  const payload: Payload<T> = {
    // We use these fields to store the result.
    _status: -1,
    _result: ctor,
  };

  // 其中包含以下内容，该版本和 16.7 的版本的返回内容有些不太一样，但是功能一致
  // lazyInitializer 加载模块的函数
  const lazyType: LazyComponent<T, Payload<T>> = {
    $$typeof: REACT_LAZY_TYPE,
    _payload: payload,
    _init: lazyInitializer,
  };

  if (__DEV__) {
    // In production, this would just set it on the object.
    let defaultProps;
    let propTypes;
    // $FlowFixMe
    Object.defineProperties(lazyType, {
      defaultProps: {
        configurable: true,
        get() {
          return defaultProps;
        },
        set(newDefaultProps) {
          console.error(
            'React.lazy(...): It is not supported to assign `defaultProps` to ' +
              'a lazy component import. Either specify them where the component ' +
              'is defined, or create a wrapping component around it.',
          );
          defaultProps = newDefaultProps;
          // Match production behavior more closely:
          // $FlowFixMe
          Object.defineProperty(lazyType, 'defaultProps', {
            enumerable: true,
          });
        },
      },
      propTypes: {
        configurable: true,
        get() {
          return propTypes;
        },
        set(newPropTypes) {
          console.error(
            'React.lazy(...): It is not supported to assign `propTypes` to ' +
              'a lazy component import. Either specify them where the component ' +
              'is defined, or create a wrapping component around it.',
          );
          propTypes = newPropTypes;
          // Match production behavior more closely:
          // $FlowFixMe
          Object.defineProperty(lazyType, 'propTypes', {
            enumerable: true,
          });
        },
      },
    });
  }

  return lazyType;
}