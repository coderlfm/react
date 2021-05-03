import React from 'react'
import ReactDOM from 'react-dom'

import TestChildren from './demos/children'

function App() {
  return <>
    <TestChildren />
  </>
}

ReactDOM.render(
  <App />,
  document.getElementById('root')
)
