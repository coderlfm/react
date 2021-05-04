# 阅读 React 源码

阅读之前先找到入口 `packages/react/src/React.js`

导航

[React.createElemet](#reactcreateElemet)

[React.Component](#reactcomponent)

[React.CreateRef](#React.CreateRef)

## React.createElemet
在入口文件 `React.js` 中可以看到， `createElement` 是在 `ReactElement.js` 中导出的

``` js
// 第一个是元素类型，第二个是这个元素身上的属性，第三个参数以及剩余参数都是子元素
function createElement(type, config, children){

  ...

  // 最终调用 ReactElement 来进行创建 
  return ReactElement(
    type, // 元素类型
    key,  // key
    ref,  // 元素 ref
    self, // 自身
    source, // 记录谁创建的该元素
    ReactCurrentOwner.current,
    props,  // 元素属性，以及 children
  );
}
```


``` jsx
// 该函数 的作用很简单,将 createElement 传过来的参数进行整合，并且添加一个 $$typeof 属性，最终将 element 返回
const ReactElement = function(type, key, ref, self, source, owner, props) {
  
  const element = {
    // This tag allows us to uniquely identify this as a React Element
    // 所有通过 react 创建的元素 $$typeof 
    $$typeof: REACT_ELEMENT_TYPE,

    // Built-in properties that belong on the element //属于元素的内置属性 
    type: type,
    key: key,
    ref: ref,
    props: props,

    // Record the component responsible for creating this element. //记录负责创建此元素的组件。
    _owner: owner,
  };

  // if(__DEV__) ...

  // 最终返回一个 element
  return element;
};
```

## React.Component 和 React.PureComponent
在入口文件 `React.js` 中可以看到， `Component` 和 `PureComponent` 是在 `ReactBaseClasses.js` 中导出的

``` js 

const emptyObject = {};

function Component(props, context, updater) {
  this.props = props;
  this.context = context;
  // If a component has string refs, we will assign a different object later.
  // 这个 refs 就是 字符串的 ref 的方式
  this.refs = emptyObject;
  // We initialize the default updater but the real one gets injected by the
  // renderer.
  // updater 此处作为参数传入，但是我们在编写组件的一般没有写，这个 updater 在不同平台的实现方式不太一样，例如 React Native，所以这里需要作为参数
  this.updater = updater || ReactNoopUpdateQueue;
}

// 表示这是一个 React 组件
Component.prototype.isReactComponent = {};



function ComponentDummy() {}
ComponentDummy.prototype = Component.prototype;

/**
 * Convenience component with default shallow equality check for sCU.
 */
function PureComponent(props, context, updater) {
  this.props = props;
  this.context = context;
  // If a component has string refs, we will assign a different object later.
  this.refs = emptyObject;
  this.updater = updater || ReactNoopUpdateQueue;
}

const pureComponentPrototype = (PureComponent.prototype = new ComponentDummy());
pureComponentPrototype.constructor = PureComponent;
// Avoid an extra prototype jump for these methods.
Object.assign(pureComponentPrototype, Component.prototype);
pureComponentPrototype.isPureReactComponent = true;
```

`ReactBaseClasses.js` 中出了 定义了 `Component` 和 `PureComponent`外还定义了 我们在类组件中更新数据时调用 `setState()`, 以及强制更新函数 `forceUpdate()`,
但是这些方法具体的实现并没有在 `ReactBaseClasses.js`，这里最主要是做了一些属性的承载
 

## React.CreateRef

字符串 ref 和回调函数的 ref 方式这里先不详细深入
此处主要先看 通过 `React.CreateRef()` 的方式来创建 ref

该代码实现在 `ReactCreateRef.js` 中，代码也很少，

``` js
// 最主要返回了一个对象，对象中有一个 current 属性
export function createRef(): RefObject {
  const refObject = {
    current: null,
  };
  if (__DEV__) {
    Object.seal(refObject);
  }
  return refObject;
}
```


## React.forwardRef
该部分源码在 `ReactForwardRef.js`
forwardRef可以帮助我们做ref转发，
一般 ref 是用来获取 真实dom或者 组件实例的，但是函数组件没有实例，所以
可以通过 forwardRef 来做 ref 转发

``` js

export function forwardRef<Props, ElementType: React$ElementType>(
  render: (props: Props, ref: React$Ref<ElementType>) => React$Node,
) {

  // if (__DEV__) ...
  // 此处的 $$typeof 是在 createElement 中是 type.$$typeof
  const elementType = {
    $$typeof: REACT_FORWARD_REF_TYPE,
    render,
  };
  // if (__DEV__) ...

  return elementType;
}

```

## React.React.createText
该api可以使我们将一些状态跨多个层级进行传递 `React.React.createText` 会返回 `Provider` 和 `Consumer`

这个api的实现源码在 `ReactContext.js` 中

``` js
  const context: ReactContext<T> = {
    $$typeof: REACT_CONTEXT_TYPE,
    // As a workaround to support multiple concurrent renderers, we categorize
    // some renderers as primary and others as secondary. We only expect
    // there to be two concurrent renderers at most: React Native (primary) and
    // Fabric (secondary); React DOM (primary) and React ART (secondary).
    // Secondary renderers store their context values on separate fields.
    // 用来存储值的属性
    _currentValue: defaultValue,
    _currentValue2: defaultValue,
    // Used to track how many concurrent renderers this context currently
    // supports within in a single renderer. Such as parallel server rendering.
    _threadCount: 0,
    // These are circular
    Provider: (null: any),
    Consumer: (null: any),
  };

  // 给 context.Provider 赋值并且让 _context 等于自身
  context.Provider = {
    $$typeof: REACT_PROVIDER_TYPE,
    _context: context,
  };

  let hasWarnedAboutUsingNestedContextConsumers = false;
  let hasWarnedAboutUsingConsumerProvider = false;
  let hasWarnedAboutDisplayNameOnConsumer = false;

  if (__DEV__) { ... } 
  else {
    // 给 context.Consumer 赋值 并且让它等于自身
    context.Consumer = context;
  }

  if (__DEV__) {
    context._currentRenderer = null;
    context._currentRenderer2 = null;
  }

  return context;
}
```

## useState 和 useEffect 简单阅读
hooks 是 React 16.8 之后新增的特性，它可以让函数式组件可以保存状态，现在我们开发中用的比较多的也是这种

hooks 源码在 `ReactHooks.js` 中


``` js 
export function useState<S>(
  initialState: (() => S) | S,
): [S, Dispatch<BasicStateAction<S>>] {
  const dispatcher = resolveDispatcher();
  return dispatcher.useState(initialState);
}
```

``` js
export function useEffect(
  create: () => (() => void) | void,
  deps: Array<mixed> | void | null,
): void {
  const dispatcher = resolveDispatcher();
  return dispatcher.useEffect(create, deps);
}
```
两个 hook 都调用了 `resolveDispatcher()` 来获取 `dispatcher` ，


`resolveDispatcher()`
``` js
function resolveDispatcher() {
  // 从 ReactCurrentDispatcher 中取出 current;
  const dispatcher = ReactCurrentDispatcher.current;
  // if (__DEV__) {...}
  return ((dispatcher: any): Dispatcher);
}
```

`resolveDispatcher()` 中从 ReactCurrentDispatcher 中取出 current;

`ReactCurrentDispatcher` 在 `ReactCurrentDispatcher.js` 中有定义

``` js
// ReactCurrentDispatcher.js

const ReactCurrentDispatcher = {
  /**
   * @internal
   * @type {ReactComponent}
   */
  current: (null: null | Dispatcher),
};

export default ReactCurrentDispatcher;
```

这个 `ReactCurrentDispatcher` 的 `current` 是 `null`， 之前也困惑了好久为什么这里是 `null`，看完完整的源码后发现在渲染的时候其实有给这里赋值，在 react-dom 中

## React.Children 
React.Children 可以帮我们操作 children 
`React.Children(props.children, (c) => [c, c])` 这样可以让每个子元素都创建两个

源码在 `ReactChildren.js` 中，已经写了注释，也可以直接在 demo 中打开调试进行调试来查看

<br/>
<br/>

# React-dom

## ReactDOM.render
`render` 方法的源码在  `packages\react-dom\src\client\ReactDOMLegacy.js`中

``` js
export function render(
  element: React$Element<any>,
  container: Container,
  callback: ?Function,
) {

  // 校验容器是否有效
  invariant(
    isValidContainer(container),
    'Target container is not a DOM element.',
  );
  // if (__DEV__) { ... }
  
  /* 
    调用 legacyRenderSubtreeIntoContainer()
    function legacyRenderSubtreeIntoContainer(
      parentComponent: ?React$Component<any, any>,
      children: ReactNodeList,
      container: Container,
      forceHydrate: boolean,
      callback: ?Function,
    ) */
  return legacyRenderSubtreeIntoContainer(
    null,
    element,
    container,
    false,
    callback,
  );
}
```
可以看到 render 方法内部只是对 legacyRenderSubtreeIntoContainer进行了调用

``` js
function legacyRenderSubtreeIntoContainer(
  parentComponent: ?React$Component<any, any>,
  children: ReactNodeList,
  container: Container,
  forceHydrate: boolean,
  callback: ?Function,
) {
  // if (__DEV__) { ... }

  // 第一次 render 的时候 _reactRootContainer 是空 
  let root = container._reactRootContainer;
  let fiberRoot: FiberRoot;

  if (!root) {
    // Initial mount 初始化挂载，获取到 fiber 容器
    root = container._reactRootContainer = legacyCreateRootFromDOMContainer(
      container,
      forceHydrate,
    );
    
    fiberRoot = root._internalRoot;

    if (typeof callback === 'function') {
      const originalCallback = callback;
      callback = function() {
        const instance = getPublicRootInstance(fiberRoot);
        originalCallback.call(instance);
      };
    }
    // Initial mount should not be batched. 初始安装不应分批。 
    unbatchedUpdates(() => {
      // <App />, fiberRoot, null, undefined
      updateContainer(children, fiberRoot, parentComponent, callback);
    });
  } else {
    fiberRoot = root._internalRoot;
    if (typeof callback === 'function') {
      const originalCallback = callback;
      callback = function() {
        const instance = getPublicRootInstance(fiberRoot);
        originalCallback.call(instance);
      };
    }
    // Update  批量更新
    updateContainer(children, fiberRoot, parentComponent, callback);
  }

  return getPublicRootInstance(fiberRoot);
}
```

在 `legacyRenderSubtreeIntoContainer()` 方法可以看到 创建 fiber`(legacyCreateRootFromDOMContainer())` 和更新 `(updateContainer())` 的 过程 

源码笔记
![react-dom.render()](./assets/img/react-dom-render().png);

调试时在 render 方法内部设置断点开始调试


fiberRoot 属性
```  js
export type FiberRoot = {
  // ...BaseFiberRootProperties,

  // The type of root (legacy, batched, concurrent, etc.)
  // 根的类型（旧版，批处理，并发等）
  tag: RootTag,

  // Any additional information from the host associated with this root.
  // 根容器，render方法接收的第二个参数
  containerInfo: any,

  // 只有在持久更新中会用到，也就是不支持增量更新的平台，react-dom不会用到
  // Used only by persistent updates.
  pendingChildren: any,
  
  // The currently active root fiber. This is the mutable root of the tree.
  //  当前应用对应的Fiber对象，是Root Fiber
  current: Fiber,

  pingCache: WeakMap<Wakeable, Set<mixed>> | Map<Wakeable, Set<mixed>> | null,

  // A finished work-in-progress HostRoot that's ready to be committed.
  // 已经完成的任务的FiberRoot对象，如果你只有一个Root，那他永远只可能是这个Root对应的Fiber，或者是null
  // 在commit阶段只会处理这个值对应的任务
  finishedWork: Fiber | null,

  // Timeout handle returned by setTimeout. Used to cancel a pending timeout, if
  // it's superseded by a new one.
  // 在任务被挂起的时候通过setTimeout设置的返回内容，用来下一次如果有新的任务挂起时清理还没触发的timeout
  timeoutHandle: TimeoutHandle | NoTimeout,

  // Top context object, used by renderSubtreeIntoContainer
  // 顶层context对象，只有主动调用`renderSubtreeIntoContainer`时才会有用
  context: Object | null,

  pendingContext: Object | null,
  
  // Determines if we should attempt to hydrate on the initial mount
  ////确定是否应该在初始安装时尝试合并
  +hydrate: boolean,

  // Used by useMutableSource hook to avoid tearing during hydration.
  // 由useMutableSource挂钩使用，以避免在合并过程中撕裂。
  mutableSourceEagerHydrationData?: Array<
    MutableSource<any> | MutableSourceVersion,
  > | null,

  // Node returned by Scheduler.scheduleCallback. Represents the next rendering
  // task that the root will work on.
  //Scheduler.scheduleCallback返回的节点。代表下一个渲染
  //根将要执行的任务。 
  callbackNode: *,
  callbackPriority: Lane,
  eventTimes: LaneMap<number>,

  // 当前更新对应的过期时间
  expirationTimes: LaneMap<number>,

  pendingLanes: Lanes,
  suspendedLanes: Lanes,
  pingedLanes: Lanes,
  expiredLanes: Lanes,
  mutableReadLanes: Lanes,

  finishedLanes: Lanes,

  entangledLanes: Lanes,
  entanglements: LaneMap<Lanes>,

  pooledCache: Cache | null,
  pooledCacheLanes: Lanes,
  

  //以下字段仅由enableSuspenseCallback用于水合。 
  // ...SuspenseCallbackOnlyFiberRootProperties,
   hydrationCallbacks: null | SuspenseHydrationCallbacks,


  //以下属性仅由DevTools使用，并且仅在DEV版本中存在。
  //通过它们，DevTools Profiler UI可以显示哪些光纤计划了给定的提交。  
  // ...UpdaterTrackingOnlyFiberRootProperties,
  memoizedUpdaters: Set<Fiber>,
  pendingUpdatersLaneMap: LaneMap<Set<Fiber>>,
  ...
};


```