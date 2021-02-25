/**
 * An heart bit sender
 */
let config   = require("../../config"),
    path     = require('path');

let debug        = require('debug')('reporter'),
    _            = require("lodash");
var Accounts     = require('web3-eth-accounts');
var schedule     = require('node-schedule');
var got          = require('got');
const si         = require('systeminformation');
let knex         = require("../../db/pg/knex");
var TxPusher     = require("./TxPusher");
var PrMonitor    = require("./processMonitor");
var prMonitor    = new PrMonitor();
var txPusher     = new TxPusher();
var accounts     = new Accounts();
const uuid       = require('uuid/v4');

//get data from statusInfo
var os           = require('os');
var jsonFile     = require('jsonfile');
const statusInfo = path.join(os.homedir(), 'statusInfo.json'),
      nodePort   = path.join(os.homedir(), 'drop_915_v_1_8/packet_forwarder/lora_pkt_fwd/local_conf.json');

var retryableObjects = []



/**
 * Constructor
 * @constructor
 */
class Report {
    constructor() {
        this.routerId         = config.get("router:id");
        this.pubKey           = config.get("router:pubKey");
        this.heartbeat_time   = config.get("reporter:interval");
        this.dailyreport_time = config.get("reporter:daily");
        this.jobInitializer();
    }

    async jobInitializer() {
        setTimeout(()=>{this.wakeUpReport()},200000);
        let response = await knex('local_config')
        .select('settings_id', 'dailyreport_time', 'heartbeat_time', 'status')
        .where({'status': '1'});
        //console.log("Taking times from DB");
        if(response.length > 0) {
            this.heartbeat_time   = response[0]['heartbeat_time'];
            this.dailyreport_time = response[0]['dailyreport_time']
        }

        console.log("Daily report time : ", this.dailyreport_time, "Heartbeat time : ", this.heartbeat_time);
        var that  = this;
        var event = schedule.scheduleJob(this.heartbeat_time, function() {
            that.sendHeartBeat();
        });

        var event1 = schedule.scheduleJob(this.dailyreport_time, function() {
            that.processList();     //get pm2 process list first then go for dailyReport();
        });
    }

    async wakeUpReport() {
        let statusData = {
            speed: 0,
            lat: 0,
            lon: 0
        };
        let local_config_port = 0;

        try{
            let local_config = jsonFile.readFileSync(nodePort);
            let status_temp = jsonFile.readFileSync(statusInfo);
            if(status_temp){
                statusData = {
                    speed: status_temp.speed != 'Testing Internet Speed' ? status_temp.speed: 0,
                    lat: status_temp.lat != null ? status_temp.lat: 0,
                    lon: status_temp.lon != null ? status_temp.lon: 0
                }
            }
            if(local_config){
                local_config_port = local_config.gateway_conf.gateway_ID.slice(-6);
            }
        }
        catch(error){
            console.log("File read error", error);
        }
        console.log("NODE DATA  =====>  ", statusData, local_config_port); 

        //prepare wakeUp post request header and body
        let body   = {
            data: statusData,
            servicePort: local_config_port
        };
        let signed = await accounts.sign(JSON.stringify(body), config.get("router:privKey"));
        let headers = {
            'x-gateway-id': this.routerId,
            'x-sign': signed.signature,
            'content-type': 'application/json'
        }
        got.post(config.get("reporter:url") + '/router/location', {
            headers: headers,
            body: JSON.stringify(body)
        }).catch((x)=>{
            console.log("Error at api wakeUp request: ", x.code);
        });
    }

    async processList() {
        //pm2 process status
        let pm2Status = [];
        await prMonitor.getList((response)=>{
            if(response.length>0){
                for(var i = 0;i<response.length;i++){
                    let process = response[i].pm2_env;
                    pm2Status.push({
                        name: process.name,
                        status: process.status,
                        uptime: process.pm_uptime,
                        restart_time: process.restart_time
                    })
                }
            }
            this.sendDailyReport(pm2Status);
        });
    }

    /**
     * Returns promise that returns current gas price.
     */
    async sendDailyReport(pm2Status) {
        console.log(new Date().toISOString(),' : Daily Reporting triggered at ', String(new Date()), "\n Pm2 Status", pm2Status);
        var that = this;
        let now      = new Date();
        let recordId = uuid();
        let priv     = new Date(now - 8.64e7);
        // console.log(priv.toISOString(), now.toISOString());
        let response = await knex('local_heartbeat')
        .select('heartbeat', 'timestamp')
        .whereBetween('timestamp', [priv.toISOString(), now.toISOString()])
        .orderBy('timestamp');

        if(response.length === 0) {
            // console.log("no data found");
            return;
        }

        // console.log(response.length, response.length);
        let statusData = {
            speed: 0,
            lat: 0,
            lon: 0
        };
        jsonFile.readFile(statusInfo, async function (err, obj) {
            if (!err) {
                statusData = {
                    speed: obj.speed != 'Testing Internet Speed' ? obj.speed: 0,
                    lat: obj.lat != null ? obj.lat: 0,
                    lon: obj.lon != null ? obj.lon: 0
                }
            }
            //read loca port config file
            let local_config = jsonFile.readFileSync(nodePort);
            let local_config_port;
            if(local_config){
                local_config_port = local_config.gateway_conf.gateway_ID.slice(-6);
            }
            console.log("NODE DATA  =====>  ", statusData, local_config_port);    

            let heartBeats  = Number(response.length);
            let data        = statusData;
            let txresult    = await txPusher.pushDailyRecord(recordId, Number(new Date(now)), JSON.stringify(data), heartBeats);


            let result = await knex("local_daily_report")
            .insert({
                "id": recordId,
                "report": JSON.stringify(data),
                "uptime": heartBeats,
                "timestamp": new Date().toISOString(),

            })
            .catch((x)=>{
                console.log("DB local_daily_report insert error: ", x);
            });

            //prepare dailyreport post request header and body
            let body   = {
                transactionHash: txresult.transactionHash,
                id: recordId,
                dailyUptime: {"value": heartBeats, "unit": "hr"},
                data: data,
                timeFrame: {"start": Number(priv), "end": Number(now)},
                timestamp: now.toISOString(),
                pm2Status: JSON.stringify({pm2StatusArray:pm2Status}),
                servicePort: local_config_port
            };
            let signed = await accounts.sign(JSON.stringify(body), config.get("router:privKey"));
            let headers = {
                'x-gateway-id': that.routerId,
                'x-sign': signed.signature,
                'content-type': 'application/json'
            }
            got.post(config.get("reporter:url") + '/dailyreport/', {
                headers: headers,
                body: JSON.stringify(body)
            }).catch((x)=>{
                console.log("Error at api dailyreport request: ", x.code);
                retryPusher(body,"/dailyreport/",headers);
            });
        })
    }

    /**
     * Function to send hourly report
     * @returns {Promise<void>}
     */
    async sendHeartBeat() {
        console.log(new Date().toISOString(),' : Heartbeat triggered at ', String(new Date()));

        let memory = await si.mem();
        let speed  = await si.cpuCurrentspeed();
        let time   = si.time();
        let load   = await si.currentLoad();

        let body = {
            uptime: this.format(time.uptime),
            memory: {
                total: this.formatBytes(memory.total),
                free: this.formatBytes(memory.free),
                used: this.formatBytes(memory.used)
            },
            speed: speed,
            load: {
                currentload: load.currentload,
                avgload: load.avgload,
                currentload_system: load.currentload_system
            }
        };

        var localheartbeat = {
            uptime: this.format(time.uptime),
            avgload: load.avgload
        };

        let signed = await accounts.sign(JSON.stringify(body), config.get("router:privKey"));
        let headers = {
            'x-gateway-id': this.routerId,
            'x-sign': signed.signature,
            'content-type': 'application/json'
        }
        await got.post(config.get("reporter:url") + '/heartbeat/', {
            headers: headers,
            body: JSON.stringify(body)
        })
        .then(async (response) => {
            // console.log("response", response.statusCode);
            this.configHandler(response.body);
            let result = await knex("local_heartbeat")
            .insert({
                "heartbeat": localheartbeat,
                "timestamp": new Date().toISOString(),
            })
            .catch(err => {
                // console.log("DB local_heartbeat insert error: ", err);
                throw err

            });
        })
        .catch(error => {
            console.log("Error in heartbeat post: ", typeof error.code === "undefined" ? error : error.code);
            retryPusher(body,"/heartbeat/",headers)
        });

        debug("Reporting Done");

    }

    /**
     *
     * @param seconds
     * @returns {string}
     */
    format(seconds) {
        function pad(s) {
            return (s < 10 ? '0' : '') + s;
        }

        var hours   = Math.floor(seconds / (60 * 60));
        var minutes = Math.floor(seconds % (60 * 60) / 60);
        var seconds = Math.floor(seconds % 60);

        return pad(hours) + ':' + pad(minutes) + ':' + pad(seconds);
    }

    /**
     *
     * @param bytes
     * @param decimals
     * @returns {string}
     */
    formatBytes(bytes, decimals = 2) {
        if(bytes === 0) return '0 Bytes';

        const k     = 1024;
        const dm    = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    /**
     *
     * @param res
     * @returns {Promise<void>}
     */
    async configHandler(res) {
        res = JSON.parse(res);
        if(!res.setting_change) {
            // console.log("Acknowledgement Received");
            return
        }

        var response = await knex("local_config")
        .update({
            "settings_id": res.change.settings_id,
            "dailyreport_time": res.change.dailyreport_time,
            "heartbeat_time": res.change.heartbeat_time,
            "status": 1,
            "timestamp": new Date().toISOString(),
        },["settings_id"])
        .catch(err => {
            console.log("DB local_config update error: ", err);
        });

        if(response.length == 0) {
            var response1 = await knex("local_config")
            .insert({
                "settings_id": res.change.settings_id,
                "dailyreport_time": res.change.dailyreport_time,
                "heartbeat_time": res.change.heartbeat_time,
                "status": 1,
                "timestamp": new Date().toISOString(),
            })
            .catch(err => {
                console.log("DB local_config insert error: ", err);

            });
            if (response1.rowCount == 0) return;
        }

        // console.log("Record updated " ,response.rowCount);
        var msg = {
            msg: "settings loaded",
            settings_id: res.change.settings_id
        };
        let ack = await accounts.sign(JSON.stringify(msg), config.get("router:privKey"));

        await got.post(config.get("reporter:url") + '/router/settingsack', {
            headers: {
                'x-gateway-id': this.routerId,
                'x-sign': ack.signature,
                'content-type': 'application/json'
            },
            body: JSON.stringify(msg)
        })
        .then(async (response) => {
            // console.log("response", response.statusCode);
            process.exit(2);

        })
        .catch(error => {
            console.log("Error in api settings acknowledgement: ", typeof error.code === "undefined" ? error : error.code);
        })
    }
}

function retryPusher(postObject,endpoint,header){
    var retryableObject = {
        body : postObject,
        header: header,
        endpoint: endpoint,
        tryCount:3
    }
    retryableObjects.push(retryableObject);
    setTimeout(function() {networkRetryer()},10000)
}

async function networkRetryer(){
    console.log("network retryer length===>", retryableObjects.length)
    if (retryableObjects.length ==0) return
    var object = retryableObjects.pop();
    console.log("network retryer length===>", object.endpoint, "===", object.tryCount);
    await got.post(config.get("reporter:url") + object.endpoint, {
        headers: object.header,
        body: JSON.stringify(object.body)
    }).then((response) => {
        console.log("completed=========>");
    }).catch((x)=>{
        object.tryCount = object.tryCount - 1
        if(object.tryCount!=0){
            retryableObjects.push(object);
        }
    })
    setTimeout(function() {networkRetryer()},10000);
}

module.exports = Report;
