import React, { useEffect, useState, } from 'react';
import ReactDOM from 'react-dom'
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

    console.log("%c'useEffect被执行 %c", "color:green",)
    return () => {
      console.log('useEffect 卸载函数被执行');
    }
  }, [])

  const [flag, setFlag] = useState(true)
  const [counter, setCounter] = useState(1)

  // 事件系统
  // return <EventDemo/>

  // return <Hooks/>
  // fiber树

  return (
    <div className="App" onClick={() => {
      debugger;
      // setFlag(!flag)
      setCounter(counter + 1);
    }}>
      <h4>counter:{counter}</h4>
      {
        flag
          ? (
            <div>
              <h2 key="hello" className="h2-wrap">hello</h2>
              <p key="world" className="p-wrap">world</p>
            </div>
          )
          : (<div>
            <h6 key="hello">hello</h6>
            <p key="world">world</p>
          </div>)
      }

      {/* <span>我是span {count}</span> */}
      {/* <h2>我是h2</h2> */}
      {/* {ReactDOM.createPortal} */}
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
