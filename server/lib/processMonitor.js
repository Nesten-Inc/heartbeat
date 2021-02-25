let pm2 = require('pm2');

class processMonitor {
    constructor(){
        // this.getList();
    }

    async getList(cb){
        pm2.list((err, list)=>{
            if(err) {
                console.error(err);
                cb(err);
            }
            cb(list);
        });
    }
}

module.exports = processMonitor;