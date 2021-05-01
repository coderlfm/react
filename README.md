# 阅读 React 源码

阅读之前先找到入口 `packages/react/src/React.js`

导航

[React.createElemet](#React.createElemet)

[React.Component](#React.Component)

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
// 最主要返回了一个一个对象，对象中有一个 current 属性
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
