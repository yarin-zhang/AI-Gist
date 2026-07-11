type Key = IDBValidKey

interface IndexDefinition {
  keyPath: string
  unique?: boolean
}

export interface StoreDefinition {
  keyPath?: string
  autoIncrement?: boolean
  indexes?: Record<string, IndexDefinition>
}

interface StoreState {
  definition: Required<Pick<StoreDefinition, 'keyPath' | 'autoIncrement'>> & StoreDefinition
  records: Map<Key, any>
  nextKey: number
}

export interface InjectedWriteFailure {
  storeName: string
  /** One-based write ordinal for this store across the lifetime of the database. */
  writeNumber: number
  error?: Error
}

export interface TransactionalIndexedDB {
  db: IDBDatabase
  snapshot(storeName: string): any[]
  seed(storeName: string, records: any[]): void
  injectWriteFailure(failure: InjectedWriteFailure | null): void
}

interface MutableRequest<T = any> {
  result: T
  error: DOMException | Error | null
  onsuccess: ((event: Event) => void) | null
  onerror: ((event: Event) => void) | null
}

const clone = <T>(value: T, seen = new WeakMap<object, any>()): T => {
  if (value === null || typeof value !== 'object') return value
  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    return value.slice(0, value.size, value.type) as T
  }
  if (value instanceof Date) return new Date(value.getTime()) as T
  if (seen.has(value as object)) return seen.get(value as object)
  if (Array.isArray(value)) {
    const result: any[] = []
    seen.set(value, result)
    value.forEach(item => result.push(clone(item, seen)))
    return result as T
  }
  const result: Record<string, any> = {}
  seen.set(value as object, result)
  for (const [key, item] of Object.entries(value as Record<string, any>)) {
    result[key] = clone(item, seen)
  }
  return result as T
}

const createNameList = (names: string[]) => {
  const list = [...names] as string[] & { contains(name: string): boolean; item(index: number): string | null }
  list.contains = (name: string) => list.includes(name)
  list.item = (index: number) => list[index] ?? null
  return list
}

function createRequest<T = any>(): MutableRequest<T> {
  return {
    result: undefined as T,
    error: null,
    onsuccess: null,
    onerror: null
  }
}

function createConstraintError(storeName: string, indexName: string, value: unknown): DOMException {
  return new DOMException(
    `Unique index ${storeName}.${indexName} already contains ${JSON.stringify(value)}`,
    'ConstraintError'
  )
}

export function createTransactionalIndexedDB(
  definitions: Record<string, StoreDefinition>
): TransactionalIndexedDB {
  const stores = new Map<string, StoreState>()
  const writesByStore = new Map<string, number>()
  let injectedFailure: InjectedWriteFailure | null = null

  for (const [storeName, definition] of Object.entries(definitions)) {
    stores.set(storeName, {
      definition: {
        ...definition,
        keyPath: definition.keyPath ?? 'id',
        autoIncrement: definition.autoIncrement ?? true
      },
      records: new Map(),
      nextKey: 1
    })
  }

  const db = {
    objectStoreNames: createNameList([...stores.keys()]),
    transaction(storeNames: string | string[], mode: IDBTransactionMode = 'readonly') {
      const names = typeof storeNames === 'string' ? [storeNames] : [...storeNames]
      for (const name of names) {
        if (!stores.has(name)) {
          throw new DOMException(`Object store ${name} does not exist`, 'NotFoundError')
        }
      }

      const workingStores = new Map<string, StoreState>()
      const originalStores = new Map<string, StoreState>()
      for (const name of names) {
        const source = stores.get(name)!
        const original = {
          definition: source.definition,
          records: new Map([...source.records].map(([key, value]) => [key, clone(value)])),
          nextKey: source.nextKey
        }
        originalStores.set(name, original)
        workingStores.set(name, {
          definition: original.definition,
          records: new Map([...original.records].map(([key, value]) => [key, clone(value)])),
          nextKey: original.nextKey
        })
      }

      let pendingRequests = 0
      let completionTimer: ReturnType<typeof setTimeout> | null = null
      let finished = false

      const transaction: any = {
        db,
        mode,
        error: null,
        objectStoreNames: createNameList(names),
        oncomplete: null,
        onerror: null,
        onabort: null,
        abort() {
          abortTransaction(new DOMException('Transaction aborted', 'AbortError'))
        },
        objectStore(storeName: string) {
          const state = workingStores.get(storeName)
          if (!state) {
            throw new DOMException(`Store ${storeName} is outside this transaction`, 'NotFoundError')
          }

          const indexDefinitions = state.definition.indexes || {}
          const objectStore: any = {
            name: storeName,
            keyPath: state.definition.keyPath,
            autoIncrement: state.definition.autoIncrement,
            indexNames: createNameList(Object.keys(indexDefinitions)),
            transaction,
            add(value: any, explicitKey?: Key) {
              return queueWrite(storeName, state, value, explicitKey, false)
            },
            put(value: any, explicitKey?: Key) {
              return queueWrite(storeName, state, value, explicitKey, true)
            },
            clear() {
              return queueOperation<void>(() => {
                assertWritable()
                state.records.clear()
                return undefined
              })
            },
            delete(key: Key) {
              return queueOperation<void>(() => {
                assertWritable()
                state.records.delete(key)
                return undefined
              })
            },
            get(key: Key) {
              return queueOperation<any>(() => clone(state.records.get(key)))
            },
            getAll() {
              return queueOperation<any[]>(() => [...state.records.values()].map(value => clone(value)))
            },
            getAllKeys() {
              return queueOperation<Key[]>(() => [...state.records.keys()].map(value => clone(value)))
            },
            count() {
              return queueOperation<number>(() => state.records.size)
            },
            index(indexName: string) {
              const definition = indexDefinitions[indexName]
              if (!definition) {
                throw new DOMException(`Index ${indexName} does not exist`, 'NotFoundError')
              }
              return {
                name: indexName,
                keyPath: definition.keyPath,
                unique: Boolean(definition.unique),
                get(indexKey: Key) {
                  return queueOperation<any>(() => {
                    const found = [...state.records.values()]
                      .find(record => record?.[definition.keyPath] === indexKey)
                    return clone(found)
                  })
                },
                getAll(indexKey?: Key) {
                  return queueOperation<any[]>(() => [...state.records.values()]
                    .filter(record => indexKey === undefined || record?.[definition.keyPath] === indexKey)
                    .map(value => clone(value)))
                }
              }
            }
          }
          return objectStore
        }
      }

      const assertWritable = () => {
        if (mode === 'readonly') {
          throw new DOMException('Transaction is read-only', 'ReadOnlyError')
        }
      }

      const abortTransaction = (error: DOMException | Error) => {
        if (finished) return
        finished = true
        transaction.error = error
        if (completionTimer) clearTimeout(completionTimer)
        for (const [name, state] of originalStores) {
          stores.set(name, {
            definition: state.definition,
            records: new Map([...state.records].map(([key, value]) => [key, clone(value)])),
            nextKey: state.nextKey
          })
        }
        queueMicrotask(() => {
          transaction.onerror?.(new Event('error'))
          transaction.onabort?.(new Event('abort'))
        })
      }

      const scheduleCompletion = () => {
        if (finished || pendingRequests > 0 || completionTimer) return
        completionTimer = setTimeout(() => {
          completionTimer = null
          if (finished || pendingRequests > 0) return
          for (const [name, state] of workingStores) {
            stores.set(name, {
              definition: state.definition,
              records: new Map([...state.records].map(([key, value]) => [key, clone(value)])),
              nextKey: state.nextKey
            })
          }
          finished = true
          transaction.oncomplete?.(new Event('complete'))
        }, 0)
      }

      const queueOperation = <T>(operation: () => T): MutableRequest<T> => {
        if (finished) {
          throw new DOMException('Transaction is inactive', 'TransactionInactiveError')
        }
        if (completionTimer) {
          clearTimeout(completionTimer)
          completionTimer = null
        }
        const request = createRequest<T>()
        pendingRequests += 1
        queueMicrotask(() => {
          if (finished) return
          try {
            request.result = operation()
            // Make a completed request visible to the next transaction. This
            // models IndexedDB's write-transaction serialization while still
            // retaining the original snapshot for abort rollback.
            if (mode !== 'readonly') {
              for (const [name, state] of workingStores) {
                stores.set(name, {
                  definition: state.definition,
                  records: new Map([...state.records].map(([key, value]) => [key, clone(value)])),
                  nextKey: state.nextKey
                })
              }
            }
            request.onsuccess?.(new Event('success'))
          } catch (error) {
            request.error = error instanceof DOMException || error instanceof Error
              ? error
              : new DOMException(String(error), 'UnknownError')
            request.onerror?.(new Event('error'))
            abortTransaction(request.error)
          } finally {
            pendingRequests -= 1
            scheduleCompletion()
          }
        })
        return request
      }

      const queueWrite = (
        storeName: string,
        state: StoreState,
        input: any,
        explicitKey: Key | undefined,
        overwrite: boolean
      ): MutableRequest<Key> => queueOperation<Key>(() => {
        assertWritable()
        const writeNumber = (writesByStore.get(storeName) || 0) + 1
        writesByStore.set(storeName, writeNumber)
        if (injectedFailure?.storeName === storeName && injectedFailure.writeNumber === writeNumber) {
          throw injectedFailure.error || new DOMException(
            `Injected write failure for ${storeName} #${writeNumber}`,
            'QuotaExceededError'
          )
        }

        const value = clone(input)
        const keyPath = state.definition.keyPath
        let key = explicitKey ?? value?.[keyPath]
        if (key === undefined && state.definition.autoIncrement) {
          key = state.nextKey++
          value[keyPath] = key
        }
        if (key === undefined) {
          throw new DOMException(`Missing key ${keyPath}`, 'DataError')
        }
        if (!overwrite && state.records.has(key)) {
          throw createConstraintError(storeName, keyPath, key)
        }

        for (const [indexName, definition] of Object.entries(state.definition.indexes || {})) {
          if (!definition.unique) continue
          const indexValue = value?.[definition.keyPath]
          if (indexValue === undefined) continue
          for (const [existingKey, existingRecord] of state.records) {
            if (existingKey !== key && existingRecord?.[definition.keyPath] === indexValue) {
              throw createConstraintError(storeName, indexName, indexValue)
            }
          }
        }

        state.records.set(key, value)
        if (typeof key === 'number' && key >= state.nextKey) {
          state.nextKey = key + 1
        }
        return key
      })

      scheduleCompletion()
      return transaction as IDBTransaction
    },
    close() {
      return undefined
    }
  } as unknown as IDBDatabase

  const seed = (storeName: string, records: any[]) => {
    const state = stores.get(storeName)
    if (!state) throw new Error(`Unknown store ${storeName}`)
    state.records.clear()
    state.nextKey = 1
    for (const input of records) {
      const record = clone(input)
      const key = record[state.definition.keyPath]
      if (key === undefined) throw new Error(`Seed record for ${storeName} is missing a key`)
      state.records.set(key, record)
      if (typeof key === 'number' && key >= state.nextKey) state.nextKey = key + 1
    }
  }

  return {
    db,
    snapshot(storeName: string) {
      const state = stores.get(storeName)
      if (!state) throw new Error(`Unknown store ${storeName}`)
      return [...state.records.values()]
        .map(value => clone(value))
        .sort((left, right) => String(left[state.definition.keyPath]).localeCompare(String(right[state.definition.keyPath])))
    },
    seed,
    injectWriteFailure(failure) {
      injectedFailure = failure
    }
  }
}
