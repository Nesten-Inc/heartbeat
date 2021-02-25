const assert  = require('chai').assert;
const ethutil = require('ethereumjs-util');

const Explorer = require("../server/lib/BlockCatchUp");

describe('Explorer', () => {

    it("Retrieve a block", (done) => {
        let explorer = new Explorer();
        let block    = explorer.getBlockNumber().then(block => {
            console.log(block);
            done();
        })
    });

});