import React from 'react'

export default function Wrap() {
  return (
    <Children>
      <h4>children1</h4>
      <h4>children2</h4>
    </Children>
  )
}

function Children({ children }) {
  debugger;
  console.log(React.Children.map(children, c => [c,c]));
  return React.Children.map(children, c => [c,c])
}