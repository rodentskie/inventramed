### Setup

Raspberry PI run using DietPI OS

Build for raspberry:

```bash
TASK=rasp.build APP=consumer pnpm nx-run
```

Copy to raspberry:

```bash
rsync -avz dist/consumer dietpi@<ip>:<dir>
```

**Note** replace the `ip` and `dir`


```bash

# add user to dialout group
sudo usermod -aG dialout $USER

# confirm user group after reboot
groups $USER

# list GSM serial ports
ls -la /dev/ttyUSB*

```