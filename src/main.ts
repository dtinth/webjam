import App from './App.svelte'
import consola from 'consola'

Object.assign(window, { consola })
consola.level = 5

const app = new App({
  target: document.getElementById('app'),
})

export default app
