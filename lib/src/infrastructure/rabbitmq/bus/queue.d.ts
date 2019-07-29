import { ConnectionFactoryRabbitMQ } from '../connection/connection.factory.rabbitmq';
import { Message } from './message';
import { Exchange } from './exchange';
import * as AmqpLib from 'amqplib/callback_api';
import { IActivateConsumerOptions, IDeleteResult, IQueueInitializeResult, IQueueOptions, IStartConsumerOptions, IStartConsumerResult } from '../../../application/port/queue.options.interface';
import { IBinding } from '../../port/bus/binding.interface';
export declare class Queue {
    initialized: Promise<IQueueInitializeResult>;
    private _connection;
    private _channel;
    private _name;
    private _options;
    private _consumer;
    private _isStartConsumer;
    private _rawConsumer;
    private _consumerOptions;
    private _consumerTag;
    private _consumerInitialized;
    private _consumerStopping;
    private _deleting;
    private _closing;
    constructor(connection: ConnectionFactoryRabbitMQ, name: string, options?: IQueueOptions);
    _initialize(): void;
    private static _packMessageContent;
    private static _unpackMessageContent;
    publish(content: any, options?: any): void;
    send(message: Message, routingKey?: string): void;
    rpc(requestParameters: any): Promise<Message>;
    prefetch(count: number): void;
    recover(): Promise<void>;
    startConsumer(onMessage: (msg: any, channel?: AmqpLib.Channel) => any, options?: IStartConsumerOptions): Promise<IStartConsumerResult>;
    activateConsumer(onMessage: (msg: Message) => any, options?: IActivateConsumerOptions): Promise<IStartConsumerResult>;
    _initializeConsumer(): void;
    stopConsumer(): Promise<void>;
    delete(): Promise<IDeleteResult>;
    close(): Promise<void>;
    bind(source: Exchange, pattern?: string, args?: any): Promise<IBinding>;
    unbind(source: Exchange, pattern?: string, args?: any): Promise<void>;
    readonly connection: ConnectionFactoryRabbitMQ;
    readonly channel: AmqpLib.Channel;
    readonly name: string;
    readonly consumer: (msg: any, channel?: AmqpLib.Channel) => any;
    readonly consumerInitialized: Promise<IStartConsumerResult>;
}
