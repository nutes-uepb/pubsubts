import { IEventHandler } from '../infrastructure/port/pubsub/event.handler.interface'
import { IClientRequest } from '../infrastructure/port/rpc/resource.handler.interface'
import { ServerRegisterRabbitmq } from '../infrastructure/rabbitmq/rpc/server.register.rabbitmq'
import { IMessageSender } from '../infrastructure/port/pubsub/message.sender.interface'
import { IMessageReceiver } from '../infrastructure/port/pubsub/message.receiver.interface'
import { IConnection } from './port/connection.interface'
import { IClientRegister } from '../infrastructure/port/rpc/client.register.interface'
import { IServerRegister } from '../infrastructure/port/rpc/server.register.interface'
import { Identifier } from '../di/identifier'
import {
    IClientOptions,
    IPubExchangeOptions,
    IServerOptions,
    ISubExchangeOptions
} from './port/communications.options.interface'
import { IMessage } from './port/message.interface'
import { DI } from '../di/di'
import { IConnectionOptions, IConnectionParams } from './port/connection.config.inteface'
import { IBusConnection } from '../infrastructure/port/connection/connection.interface'

export class Connection implements IConnection {
    private readonly _pub: IMessageSender
    private readonly _sub: IMessageReceiver
    private readonly _rpcClient: IClientRegister
    private readonly _eventBusConnection: IBusConnection

    constructor(parameters?: IConnectionParams | string, options?: IConnectionOptions) {
        this._eventBusConnection = DI.get(Identifier.RABBITMQ_CONNECTION)
        this._eventBusConnection.configurations = parameters
        this._eventBusConnection.options = options

        this._pub = DI.get(Identifier.RABBITMQ_MENSSAGE_SENDER)
        this._sub = DI.get(Identifier.RABBITMQ_MENSSAGE_RECEIVER)
        this._rpcClient = DI.get(Identifier.RABBITMQ_CLIENT_REGISTER)
    }

    get isOpen(): boolean {
        return this._eventBusConnection.isConnected
    }

    public open(): Promise<this> {
        return new Promise<this>(async (resolve, reject) => {
            if (this._eventBusConnection && this._eventBusConnection.isConnected) return resolve(this)

            this._eventBusConnection
                .connect()
                .then(() => {
                    this._pub.connection = this._eventBusConnection
                    this._sub.connection = this._eventBusConnection
                    this._rpcClient.connection = this._eventBusConnection
                    return resolve(this)
                })
                .catch(reject)
        })
    }

    public async close(): Promise<boolean> {
        return this._eventBusConnection.closeConnection()
    }

    public async dispose(): Promise<boolean> {
        return this._eventBusConnection.disposeConnection()
    }

    public on(event: string | symbol, listener: (...args: any[]) => void): void {
        this._eventBusConnection.on(event, listener)
    }

    public pub(exchangeName: string,
               routingKey: string,
               message: IMessage,
               options?: IPubExchangeOptions): Promise<void> {
        return this._pub.sendRoutingKeyMessage(exchangeName, routingKey, message, options)
    }

    public sub(queueName: string,
               exchangeName: string,
               routingKey: string,
               callback: (err, message: IMessage) => void,
               options?: ISubExchangeOptions): void {
        const eventCallback: IEventHandler<any> = {
            handle: callback
        }

        this._sub
            .receiveRoutingKeyMessage(queueName, exchangeName, routingKey,
                eventCallback, options)

    }

    public createRpcServer(queueName: string,
                           exchangeName: string,
                           routingKey: string,
                           options?: IServerOptions): IServerRegister {

        return new ServerRegisterRabbitmq(this._eventBusConnection, queueName, exchangeName, routingKey, options)

    }

    public rpcClient(exchangeName: string,
                     resourceName: string,
                     parameters: any[],
                     options?: IClientOptions): Promise<IMessage>

    public rpcClient(exchangeName: string,
                     resourceName: string,
                     parameters: any[],
                     callback: (err, message: IMessage) => void,
                     options?: IClientOptions): void

    public rpcClient(exchangeName: string,
                     resourceName: string,
                     parameters: any[],
                     optOrCall?: IClientOptions | ((err, message: IMessage) => void),
                     options?: IClientOptions): any {

        if (!(optOrCall instanceof Function)) {
            return this.rpcClientPromise(exchangeName, resourceName, parameters, options)
        }

        this.rpcClientCallback(exchangeName, resourceName, parameters, optOrCall, options)

    }

    private rpcClientCallback(
        exchangeName: string,
        resourceName: string,
        parameters: any[],
        callback: (err, message: IMessage) => void,
        options?: IClientOptions): void {
        const clientRequest: IClientRequest = {
            resource_name: resourceName,
            handle: parameters
        }

        this._rpcClient
            .registerRoutingKeyClient(exchangeName, clientRequest, options)
            .then((result: IMessage) => {
                callback(undefined, result)
            })
            .catch(err => {
                callback(err, undefined)
            })
    }

    private rpcClientPromise(
        exchangeName: string,
        resourceName: string,
        parameters: any[],
        options?: IClientOptions): Promise<IMessage> {
        return new Promise<any>(async (resolve, reject) => {
            const clientRequest: IClientRequest = {
                resource_name: resourceName,
                handle: parameters
            }

            this._rpcClient
                .registerRoutingKeyClient(exchangeName, clientRequest, options)
                .then((result: IMessage) => {
                    return resolve(result)
                })
                .catch(err => {
                    return reject(err)
                })
        })
    }

}
