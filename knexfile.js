// Update with your config settings.

module.exports = {

   development: {
        client: 'pg',
        debug: false,
        connection: 'postgres://postgres:mysecretpassword@localhost:5433/gatewaychain',
        migrations: {
            directory: __dirname + '/db/pg/migrations'
        },
        seeds: {
            directory: __dirname + '/db/pg/setup/development'
        }
    },

    local: {
        client: 'pg',
        debug: false,
        connection: 'postgres://postgres:mysecretpassword@localhost:5432/heartbeat',
        migrations: {
            directory: __dirname + '/db/pg/migrations'
        },
        seeds: {
            directory: __dirname + '/db/pg/setup/development'
        }
    },
};
