/**
 * An heart bit sender
 */
let config = require("../../config");

let debug       = require('debug')('reporter'),
    _           = require("lodash");
var Web3        = require('web3');
const uuidToHex = require("uuid-to-hex");
let gateway     = require("../../config/abi");



/**
 * Constructor
 * @constructor
 */
class TxPusher {
    constructor() {
        this.web3     = new Web3(config.get("web3:url"));
        this.address  = config.get("reporter:address");
        this.gasLimit = config.get("web3:gasLimit");
        this.contract = new this.web3.eth.Contract(gateway.abi, config.get("reporter:address"));
    }

    /**
     * pushing report
     * @param recordId
     * @param timestamp
     * @param heartbeat
     * @param uptime
     * @returns {Promise<*>}
     */
    async pushDailyRecord(recordId, timestamp, heartbeat, uptime) {
        let recordIdHex = '0x' + this.web3.utils.padRight(uuidToHex(recordId), 64);
        let data = this.contract.methods.addConnectionRecord(recordIdHex, timestamp, heartbeat, uptime).encodeABI();
        return await this.sendSignedTransaction(this.address, this.gasLimit, data);
    }

    /**
     * ending signed txs
     * @param to
     * @param gas
     * @param data
     * @returns {Promise<*>}
     */
    async sendSignedTransaction(to, gas, data) {
        // console.log(to, gas, data);
        let response;
        let signature = await this.web3.eth.accounts.signTransaction({
            to: to,
            gas: gas,
            data: data
        }, config.get("router:privKey"));
        try {
            response = await this.web3.eth.sendSignedTransaction(signature.rawTransaction);
            console.log(response);
            return response

        } catch(e) {
            console.log("error", e)
        }
    }

}

module.exports = TxPusher;
