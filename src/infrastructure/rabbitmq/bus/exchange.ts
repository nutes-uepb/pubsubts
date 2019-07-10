import * as os from 'os'
import { Connection, log } from '../connection/connection'
import { Binding } from './binding'
import { Queue } from './queue'
import * as AmqpLib from 'amqplib/callback_api'
import { Message } from './message'
import * as path from 'path'

const ApplicationName = process.env.AMQPTS_APPLICATIONNAME ||
    (path.parse ? path.parse(process.argv[1]).name : path.basename(process.argv[1]))

const DIRECT_REPLY_TO_QUEUE = 'amq.rabbitmq.reply-to'

export class Exchange {
    private _initialized: Promise<Exchange.IInitializeResult>

    private _consumer_handlers: Array<[string, any]> = new Array<[string, any]>()
    private _isConsumerInitializedRcp: boolean = false

    private _connection: Connection
    private _channel: AmqpLib.Channel
    private _name: string
    private _type: string
    private _options: Exchange.IDeclarationOptions

    private _deleting: Promise<void>
    private _closing: Promise<void>

    constructor(connection: Connection, name: string, type?: string, options: Exchange.IDeclarationOptions = {}) {
        this._connection = connection
        this._name = name
        this._type = type
        this._options = options
        this._initialize()
    }

    public _initialize() {
        this._initialized = new Promise<Exchange.IInitializeResult>((resolve, reject) => {
            this._connection.initialized.then(() => {
                this._connection.connection.createChannel((err, channel) => {
                    /* istanbul ignore if */
                    if (err) {
                        reject(err)
                    } else {
                        this._channel = channel
                        const callback = (err, ok) => {
                            /* istanbul ignore if */
                            if (err) {
                                log.log('error', 'Failed to create exchange \'' + this._name + '\'.', { module: 'amqp-ts' })
                                delete this._connection.exchanges[this._name]
                                reject(err)
                            } else {
                                resolve(ok as Exchange.IInitializeResult)
                            }
                        }
                        if (this._options.noCreate) {
                            this._channel.checkExchange(this._name, callback)
                        } else {
                            this._channel.assertExchange(this._name, this._type,
                                this._options as AmqpLib.Options.AssertExchange, callback)
                        }
                    }
                })
            }).catch((err) => {
                log.log('warn', 'Channel failure, error caused during connection!', { module: 'amqp-ts' })
            })
        })
        this._connection.exchanges[this._name] = this
    }

    /**
     * deprecated, use 'exchange.send(message: Message)' instead
     */
    public publish(content: any, routingKey = '', options: any = {}): void {
        if (typeof content === 'string') {
            content = new Buffer(content)
        } else if (!(content instanceof Buffer)) {
            content = new Buffer(JSON.stringify(content))
            options.contentType = options.contentType || 'application/json'
        }
        this._initialized.then(() => {
            try {
                this._channel.publish(this._name, routingKey, content, options)
            } catch (err) {
                log.log('warn', 'Exchange publish error: ' + err.message, { module: 'amqp-ts' })
                const exchangeName = this._name
                const connection = this._connection
                connection._rebuildAll(err).then(() => {
                    log.log('debug', 'Retransmitting message.', { module: 'amqp-ts' })
                    connection.exchanges[exchangeName].publish(content, routingKey, options)
                })
            }
        })
    }

    public send(message: Message, routingKey = ''): void {
        message.sendTo(this, routingKey)
    }

    public rpc(requestParameters: any, routingKey = '', callback?: (err, message: Message) => void): Promise<Message> {
        return new Promise<Message>((resolve, reject) => {

            function generateUuid(): string {
                return Math.random().toString() +
                    Math.random().toString() +
                    Math.random().toString()
            }

            const processRpc = () => {
                const uuid: string = generateUuid()
                if (!this._isConsumerInitializedRcp) {
                    this._isConsumerInitializedRcp = true
                    this._channel.consume(DIRECT_REPLY_TO_QUEUE, (resultMsg) => {

                        const result = new Message(resultMsg.content, resultMsg.fields)
                        result.fields = resultMsg.fields

                        for (const handler of this._consumer_handlers) {
                            if (handler[0] === resultMsg.properties.correlationId) {
                                const func: Function = handler[1]
                                func.apply('', [undefined, result])
                            }
                        }

                    }, { noAck: true }, (err, ok) => {
                        /* istanbul ignore if */
                        if (err) {
                            reject(new Error('amqp-ts: Queue.rpc error: ' + err.message))
                        } else {
                            // send the rpc request
                            this._consumer_handlers.push([uuid, callback])
                            // consumerTag = ok.consumerTag
                            const message = new Message(requestParameters,
                                { correlationId: uuid, replyTo: DIRECT_REPLY_TO_QUEUE })
                            message.sendTo(this, routingKey)
                        }
                    })
                } else {
                    this._consumer_handlers.push([uuid, callback])
                    const message = new Message(requestParameters,
                        { correlationId: uuid, replyTo: DIRECT_REPLY_TO_QUEUE })
                    message.sendTo(this, routingKey)
                }

            }

            // execute sync when possible
            // if (this.initialized.isFulfilled()) {
            //   processRpc()
            // } else {
            this._initialized.then(processRpc)
            // }
        })
    }

    public delete(): Promise<void> {
        if (this._deleting === undefined) {
            this._deleting = new Promise<void>((resolve, reject) => {
                this._initialized.then(() => {
                    return Binding.removeBindingsContaining(this)
                }).then(() => {
                    this._channel.deleteExchange(this._name, {}, (err, ok) => {
                        /* istanbul ignore if */
                        if (err) {
                            reject(err)
                        } else {
                            this._channel.close((err) => {
                                delete this._initialized // invalidate exchange
                                delete this._connection.exchanges[this._name] // remove the exchange from our administration
                                /* istanbul ignore if */
                                if (err) {
                                    reject(err)
                                } else {
                                    delete this._channel
                                    delete this._connection
                                    resolve(null)
                                }
                            })
                        }
                    })
                }).catch((err) => {
                    reject(err)
                })
            })
        }
        return this._deleting
    }

    public close(): Promise<void> {
        if (this._closing === undefined) {
            this._closing = new Promise<void>((resolve, reject) => {
                this._initialized.then(() => {
                    return Binding.removeBindingsContaining(this)
                }).then(() => {
                    delete this._initialized // invalidate exchange
                    delete this._connection.exchanges[this._name] // remove the exchange from our administration
                    this._channel.close((err) => {
                        /* istanbul ignore if */
                        if (err) {
                            reject(err)
                        } else {
                            delete this._channel
                            delete this._connection
                            resolve(null)
                        }
                    })
                }).catch((err) => {
                    reject(err)
                })
            })
        }
        return this._closing
    }

    public bind(source: Exchange, pattern = '', args: any = {}): Promise<Binding> {
        const binding = new Binding(this, source, pattern, args)
        return binding.initialized
    }

    public unbind(source: Exchange, pattern = '', args: any = {}): Promise<void> {
        return this._connection.bindings[Binding.id(this, source, pattern)].delete()
    }

    public consumerQueueName(): string {
        return this._name + '.' + ApplicationName + '.' + os.hostname() + '.' + process.pid
    }

    /**
     * deprecated, use 'exchange.activateConsumer(...)' instead
     */
    public startConsumer(onMessage: (msg: any, channel?: AmqpLib.Channel) => any,
                         options?: Queue.IStartConsumerOptions): Promise<any> {
        const queueName = this.consumerQueueName()
        if (this._connection.queues[queueName]) {
            return new Promise<void>((_, reject) => {
                reject(new Error('amqp-ts Exchange.startConsumer error: consumer already defined'))
            })
        } else {
            const promises: Promise<any>[] = []
            const queue = this._connection.declareQueue(queueName, { durable: false })
            promises.push(queue.initialized)
            const binding = queue.bind(this)
            promises.push(binding)
            const consumer = queue.startConsumer(onMessage, options)
            promises.push(consumer)

            return Promise.all(promises)
        }
    }

    public activateConsumer(onMessage: (msg: Message) => any, options?: Queue.IActivateConsumerOptions): Promise<any> {
        const queueName = this.consumerQueueName()
        if (this._connection.queues[queueName]) {
            return new Promise<void>((_, reject) => {
                reject(new Error('amqp-ts Exchange.activateConsumer error: consumer already defined'))
            })
        } else {
            const promises: Promise<any>[] = []
            const queue = this._connection.declareQueue(queueName, { durable: false })
            promises.push(queue.initialized)
            const binding = queue.bind(this)
            promises.push(binding)
            const consumer = queue.activateConsumer(onMessage, options)
            promises.push(consumer)

            return Promise.all(promises)
        }
    }

    public stopConsumer(): Promise<any> {
        const queue = this._connection.queues[this.consumerQueueName()]
        if (queue) {
            return queue.delete()
        } else {
            return Promise.resolve()
        }
    }

    get initialized(): Promise<Exchange.IInitializeResult> {
        return this._initialized
    }

    get connection(): Connection {
        return this._connection
    }

    get channel(): AmqpLib.Channel {
        return this._channel
    }

    get name() {
        return this._name
    }

    get type() {
        return this._type
    }
}

export namespace Exchange {
    'use strict'

    export interface IDeclarationOptions {
        durable?: boolean
        internal?: boolean
        autoDelete?: boolean
        alternateExchange?: string
        arguments?: any
        noCreate?: boolean
    }

    export interface IInitializeResult {
        exchange: string
    }
}
