---------------
**Heartbeat**

1.  `cd /home/ubuntu`
2.  `git clone https://gitlab.com/nesten/heartbeat`
3.  `cd heartbeat`
4.  `git checkout feature/dynamic-config` 
5.  `npm install`
6.  `chmod +x setupHb.sh`
7.  `sudo ./setupHb.sh`
8.  `chmod 777 bin/api`
9.  `pm2 start pm2run.json .`
10. `pm2 save`
