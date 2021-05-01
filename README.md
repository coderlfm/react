# 阅读 React 源码

阅读之前先找到入口 `packages/react/src/React.js`

## React.createElemet
在入口文件 `React.js` 中可以看到， `createElement` 是在 `ReactElement.js` 中导出的

``` jsx
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