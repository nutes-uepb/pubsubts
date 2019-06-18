import { EventBus } from '../../rabbitmq/connection/eventbus'
import { IFanout } from '../port/fanout.interface'
import { IEventHandler } from '../../rabbitmq/port/event.handler.interface'
import { IClientRequest } from '../../rabbitmq/port/resource.handler.interface'

export class Fanout extends EventBus{ //  implements IFanout{

    private readonly typeConnection = 'fanout'

    public pub(eventName: string, exchangeName: string, message: any): Promise<boolean> {
        return new Promise<boolean>(async (resolve, reject) => {
            if (!this.pubActived){
                this.pubActived = true
                await this.pubconnection.tryConnect(this.host, this.port, this.username, this.password, this.options)
                this.pubEventInitialization()
                await this.pubconnection.conn.initialized
            }

            if (this.isPubConnected){
                this.pubconnection.sendMessage(this.typeConnection, exchangeName, undefined,
                    undefined, message, eventName).then(result => {
                    return resolve(result)
                }).catch(err => {
                    return reject(err)
                })
            }else {
                return resolve(false)
            }
        })
    }

    public sub(eventName: string, exchangeName: string, callback: (message: any) => void): Promise<boolean> {
        const eventCallback: IEventHandler<any> = {
            handle: callback
        }

        return new Promise<boolean>(async (resolve, reject) => {

            if (!this.subActived){
                this.subActived = true
                await this.subconnection.tryConnect(this.host, this.port, this.username, this.password, this.options)
                this.subEventInitialization()
                await this.subconnection.conn.initialized
            }

            if (this.isSubConnected){
                this.subconnection.receiveMessage(this.typeConnection, exchangeName, undefined,
                    undefined, eventCallback, eventName).then(result => {
                    return resolve(result)
                }).catch(err => {
                    return reject(err)
                })
            }else {
                return resolve(false)
            }
        })
    }

    public rpcClient(callback: (message: any) => void, exchangeName: string, resourceName: string, ...any: any): Promise<boolean> {
        return new Promise<boolean>(async (resolve, reject) => {

            if (!this.resourceActived){
                this.resourceActived = true
                await this.resourceConnection.tryConnect(this.host, this.port, this.username, this.password, this.options)
                this.resourceEventInitialization()
                await this.resourceConnection.conn.initialized
            }

            const clientRequest: IClientRequest = {
                resourceName,
                handle: any
            }

            if (this.isResourceConnected){
                this.resourceConnection.registerClientFanout(callback, exchangeName, clientRequest).then(result => {
                    return resolve(result)
                }).catch(err => {
                    return reject(err)
                })
            }else {
                return resolve(false)
            }
        })
    }

    public rpcServer(exchangeName: string): Promise<boolean> {
        return new Promise<boolean>(async (resolve, reject) => {

            if (!this.resourceActived){
                this.resourceActived = true
                await this.resourceConnection.tryConnect(this.host, this.port, this.username, this.password, this.options)
                this.resourceEventInitialization()
                await this.resourceConnection.conn.initialized
            }

            if (this.isResourceConnected){
                this.resourceConnection.registerServerFanout(exchangeName).then(result => {
                    return resolve(result)
                }).catch(err => {
                    return reject(err)
                })
            }else {
                return resolve(false)
            }
        })
    }
}
