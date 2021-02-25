exports.up = function(knex) {
    return Promise.all([

        knex.schema.createTable('local_daily_report', (table) => {
            table.string('id');
            table.string('report');
            table.string('uptime');
            table.timestamp('timestamp');
        }),
        knex.schema.createTable('local_heartbeat', (table) => {
            table.increments('id');
            table.string('heartbeat');
            table.timestamp('timestamp');
        }),
        knex.schema.createTable('local_config', (table) => {
            table.string('heartbeat_time');
            table.string('dailyreport_time');
            table.timestamp('timestamp').notNullable();
            table.string('settings_id').notNullable();
            table.integer('status').notNullable();
        }),

    ]);
};

exports.down = function(knex) {
    return Promise.all([

    ]);
};
