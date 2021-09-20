import { writable } from 'svelte/store'
import SimplePeer from 'simple-peer/simplepeer.min.js'
import axios from 'axios'
import consola from 'consola'
import mitt from 'mitt'

export const connectionStatus = writable('Pending')

const emitter = mitt()

let peer

export function onData(listener: any) {
  emitter.on('data', listener)
  return () => emitter.off('data', listener)
}

export function send(data: any) {
  try {
    peer.send(data)
  } catch (error) {
    consola.error(error)
  }
}

export async function connect() {
  return new Promise((resolve) => {
    peer = new SimplePeer({
      initiator: true,
      trickle: false,
      channelConfig: {
        ordered: false,
        maxRetransmits: 0,
      },
    })

    Object.assign(window, { peer })

    peer.on('signal', async (data) => {
      connectionStatus.set('Sending signal to server')
      try {
        const response = await axios.post('/api/rtc', {
          offer: data,
        })
        connectionStatus.set('Establishing WebRTC connection')
        peer.signal(response.data.answer)
      } catch (e) {
        consola.error(e)
        connectionStatus.set('Unable to send signal to server')
      }
    })

    peer.on('connect', () => {
      consola.success('WebRTC connection is successful')
      connectionStatus.set('WebRTC connection is connected')
      resolve(peer)
    })

    peer.on('close', () => {
      console.log('Received closed')
    })

    peer.on('error', (err) => {
      console.error('Received error', err)
    })

    peer.on('data', (data) => {
      emitter.emit('data', data)
    })
  })
}
