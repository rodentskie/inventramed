# consumer

Runs on the Raspberry Pi (DietPi). It takes each message from the `sms.send` queue, sends it through the USB GSM module, and publishes the result to `sms.success`.

See **SMS worker and consumer** in the root `README.md` for the environment, the Pi build, and the systemd unit.

```bash
TASK=rasp.build APP=consumer npm run task
rsync -avz dist/consumer/ dietpi@<pi-ip>:/opt/inventramed/
```
