import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockNativeRequest = vi.hoisted(() => vi.fn())
const mockNativePropfind = vi.hoisted(() => vi.fn())
const mockHttpRequest = vi.hoisted(() => vi.fn())
const platform = vi.hoisted(() => ({ value: 'ios' }))

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => platform.value },
  CapacitorHttp: { request: mockHttpRequest }
}))

vi.mock('@renderer/capacitor-bridge/webdav-native', () => ({
  default: { request: mockNativeRequest, propfind: mockNativePropfind }
}))

import { MobileWebDAVTransport } from '~/lib/services/mobile-webdav-transport'

describe('MobileWebDAVTransport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    platform.value = 'ios'
  })

  it('encodes non-ASCII Basic credentials as UTF-8 on iOS', async () => {
    mockHttpRequest.mockResolvedValue({ status: 200, data: 'ok', headers: { ETag: 'abc' } })
    const transport = new MobileWebDAVTransport()

    const response = await transport.request({
      url: 'https://dav.example.com',
      method: 'GET',
      username: '用户',
      password: '密碼'
    })

    const authorization = mockHttpRequest.mock.calls[0][0].headers.Authorization as string
    expect(Buffer.from(authorization.slice(6), 'base64').toString('utf8')).toBe('用户:密碼')
    expect(response.headers.etag).toBe('abc')
  })

  it('forwards conditional headers and preserves binary bytes through Android OkHttp', async () => {
    platform.value = 'android'
    mockNativeRequest.mockResolvedValue({
      status: 201,
      body: Buffer.from([0, 1, 2, 255]).toString('base64'),
      headers: { ETag: '"native-etag"' }
    })
    const transport = new MobileWebDAVTransport()

    const response = await transport.request({
      url: 'https://dav.example.com/object.bin',
      method: 'PUT',
      username: 'user',
      password: 'pass',
      headers: { 'If-None-Match': '*', 'Content-Type': 'application/octet-stream' },
      body: new Uint8Array([9, 8, 7]),
      responseType: 'bytes',
      connectTimeout: 1234,
      readTimeout: 5678
    })

    expect(mockNativeRequest).toHaveBeenCalledWith(expect.objectContaining({
      method: 'PUT',
      bodyBase64: Buffer.from([9, 8, 7]).toString('base64'),
      headers: expect.objectContaining({ 'If-None-Match': '*' }),
      connectTimeout: 1234,
      readTimeout: 5678
    }))
    expect(Array.from(response.data as Uint8Array)).toEqual([0, 1, 2, 255])
    expect(response.headers.etag).toBe('"native-etag"')
  })

  it('uses the native PROPFIND path on Android', async () => {
    platform.value = 'android'
    mockNativePropfind.mockResolvedValue({ status: 207, body: '<multistatus />' })
    const transport = new MobileWebDAVTransport()

    const response = await transport.request({
      url: 'https://dav.example.com/library',
      method: 'PROPFIND',
      username: 'user',
      password: 'pass',
      headers: { Depth: '1' }
    })

    expect(mockNativePropfind).toHaveBeenCalledWith(expect.objectContaining({ depth: 1 }))
    expect(response).toMatchObject({ status: 207, data: '<multistatus />' })
    expect(mockNativeRequest).not.toHaveBeenCalled()
  })
})
