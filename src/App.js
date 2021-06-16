import React, { useEffect, useState } from 'react';
import State from './components/State'
import LanesDemo from './components/LanesDemo'
import AppSibling from './components/AppSibling'
import TasksWithDifferentPriorities from './components/TasksWithDifferentPriorities'
import SchedulerTask from './components/SchedulerTask'
import Concurrent from './components/ConcurrentInput'
import Diff from './components/Diff'
import PropsDiff from './components/PropsDiff'
import Hooks from "./components/Hooks";
import EventDemo from "./components/EventDemo";
import ContextDemo from "./components/Context";
import './App.css';

// propsDiff
/*class App extends React.Component {
  render() {
    return <PropsDiff/>
  }
}*/
function App() {

  useEffect(() => {
    console.log('useEffect被执行');
    return () => {
      console.log('useEffect 卸载函数被执行');
    }
  }, [])

  const [count, setCount] = useState(1)

  // 事件系统
  // return <EventDemo/>

  // return <Hooks/>
  // fiber树

  const a = <div>
    <h2 key="hello">hello</h2>
    <p key="world">world</p>
  </div>

  // 顺序不一致
  // const b = <div>
  //   <p key="world">world</p>
  //   <h2 key="hello">hello</h2>
  // </div>
  
  // 类型不一致
  const b = <div>
    <h6 key="hello">hello</h6>
    <p key="world">world</p>
  </div>

  return (
    <div className="App" onClick={() => setCount(count + 1)}>
      {count % 2 ? a : b}
      {/* <span>我是span {count}</span> */}
      {/* <h2>我是h2</h2> */}
    </div>
  );
  {/* <span className={'app-span'} onClick={() => setCount(count + 1)}>App{count}</span> */ }
  {/* <AppSibling count={count}/> */ }

  // Scheduler调度任务与用户交互
  // return <SchedulerTask/>

  // 高优先级插队
  // return <TasksWithDifferentPriorities/>

  // context
  // return <ContextDemo/>

  // diff 算法
  // return <Diff ref={'diffRef'}/>
}

export default App;
