#!/usr/bin/env bash

docker run --restart=always --name router_pg -e POSTGRES_PASSWORD=mysecretpassword -d -p 5433:5432 postgres
sleep 20
docker exec -it router_pg psql -U postgres -c "create database gatewaychain"
npm i knex@0.20.7 -g
npm install pg --save
sleep 5
source ~/.bashrc
source ~/.profile
knex migrate:latest
