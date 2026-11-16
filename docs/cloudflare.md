# Expose InventraMed with Cloudflare Tunnel

This guide makes the app running on your machine (`http://localhost:3000`) reachable at a hostname on your own Cloudflare domain, such as `https://inventramed.example.com`. It uses a **locally-managed Cloudflare Tunnel** run by `cloudflared`.

The tunnel only makes outbound connections to Cloudflare. You don't need to open ports on your router, have a public IP, or set up TLS certificates, because Cloudflare serves HTTPS for you.

```
Browser / Pi worker ──HTTPS──► Cloudflare edge ──tunnel──► cloudflared (your machine) ──► localhost:3000 (inventramed-app)
```

Throughout this guide, replace:

| Placeholder                 | Example                         |
| --------------------------- | ------------------------------- |
| `inventramed.example.com`   | the hostname you want to use    |
| `inventramed`               | the tunnel name (any name)      |
| `<TUNNEL_UUID>`             | printed by `cloudflared tunnel create` |

> **No domain?** Use a [Quick Tunnel](#no-domain-quick-tunnel) to get a random `*.trycloudflare.com` URL. You don't need an account or any config, but the URL changes every time it restarts.

## Prerequisites

- A domain whose DNS is managed by Cloudflare (it shows as **Active** in the dashboard).
- The app running locally on port 3000. See [Run the app](#1-run-the-app).
- A Linux machine (these steps use Debian/Ubuntu and `systemd`).

## 1. Run the app

Start PostgreSQL, apply the migrations, then build and run the image from the repository root:

```bash
docker compose up -d
TASK=prisma:deploy APP=app npm run task
TASK=docker:build APP=app npm run task
TASK=docker:run APP=app npm run task
```

`docker:run` publishes the container on `localhost:3000` and reads `apps/app/.env`. Check that it responds before you continue:

```bash
curl -I http://localhost:3000
```

### Set the public URL

NextAuth v4 uses `NEXTAUTH_URL` to build its callback and redirect URLs. It also uses it to decide whether cookies are `Secure`. Set it to the public HTTPS hostname in `apps/app/.env`:

```dotenv
NEXTAUTH_URL="https://inventramed.example.com"
```

Then restart the container (stop it with `Ctrl+C` or `docker stop inventramed-app`, then run `docker:run` again). Because env vars are read at run time, you don't need to rebuild the image.

> After this change, logging in through `http://localhost:3000` sends you to the public hostname. Use the public URL, or set `NEXTAUTH_URL` back to `http://localhost:3000` for local-only work.

## 2. Install `cloudflared`

Add Cloudflare's package signing key and apt repository, then install:

```bash
sudo mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null

echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" \
  | sudo tee /etc/apt/sources.list.d/cloudflared.list

sudo apt-get update && sudo apt-get install cloudflared
cloudflared --version
```

For other systems, use the [downloads page](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/).

## 3. Log in to Cloudflare

```bash
cloudflared tunnel login
```

This opens a browser (or prints a URL). Log in and **select the domain** you want to use. `cloudflared` saves an account certificate to `~/.cloudflared/cert.pem`. The `create`, `route` and `delete` commands below need it.

### On a server without a browser (SSH)

When there's no browser, `cloudflared` prints a login URL and waits:

1. Leave `cloudflared tunnel login` running in the SSH session.
2. Open the printed URL in a browser on any other device, such as your laptop or phone.
3. Log in, select the domain, and click **Authorize**.
4. `cloudflared` downloads `cert.pem` to `~/.cloudflared/` on the server by itself and exits.

If the download fails or times out, run `cloudflared tunnel login` on a machine that has a browser, then copy the certificate to the server:

```bash
ssh user@server 'mkdir -p ~/.cloudflared'
scp ~/.cloudflared/cert.pem user@server:~/.cloudflared/cert.pem
```

## 4. Create the tunnel

```bash
cloudflared tunnel create inventramed
```

The output includes the tunnel's UUID and writes a credentials file to `~/.cloudflared/<TUNNEL_UUID>.json`. Treat that file as a secret, because anyone who has it can run your tunnel. Never commit it.

```
Created tunnel inventramed with id 6ff42ae2-765d-4adf-8112-31c55c1551ef
```

That ID is the `<TUNNEL_UUID>` used in the rest of this guide. If you lose it, find it with either of these:

```bash
cloudflared tunnel list        # ID column
ls ~/.cloudflared/*.json       # the credentials file is named <TUNNEL_UUID>.json
```

> If this server will host more apps later, name the tunnel after the server instead (for example `cloudflared tunnel create homeserver`). One tunnel can serve every app on the machine. See [Multiple apps on one tunnel](#multiple-apps-on-one-tunnel).

## 5. Write the configuration file

Create `~/.cloudflared/config.yml`. Replace `<TUNNEL_UUID>` with the ID from step 4 and `<USER>` with your Linux username:

```yaml
tunnel: <TUNNEL_UUID>
credentials-file: /home/<USER>/.cloudflared/<TUNNEL_UUID>.json

ingress:
  - hostname: inventramed.example.com
    service: http://localhost:3000
  # Required catch-all: anything else gets a 404
  - service: http_status:404
```

- Use the absolute path for `credentials-file`.
- The last ingress rule must be a catch-all without a `hostname`, or `cloudflared` refuses to start.
- `service` is plain `http://` because the tunnel is already encrypted. Cloudflare terminates HTTPS at the edge.

Validate the rules, and check which rule a URL matches:

```bash
cloudflared tunnel ingress validate
cloudflared tunnel ingress rule https://inventramed.example.com
```

## 6. Point the hostname at the tunnel

```bash
cloudflared tunnel route dns inventramed inventramed.example.com
```

This creates a proxied `CNAME` record, `inventramed.example.com → <TUNNEL_UUID>.cfargotunnel.com`, in your zone. The record doesn't serve traffic until the tunnel is running.

If a record with that name already exists, delete it in the dashboard first, or add `--overwrite-dns`.

## 7. Run the tunnel

Run it in the foreground first to check that it works:

```bash
cloudflared tunnel run inventramed
```

Wait for the `Registered tunnel connection` log lines, then open `https://inventramed.example.com` and log in. Stop it with `Ctrl+C` once you've checked.

## 8. Run the tunnel as a service

To keep the tunnel running and start it at boot, install it as a `systemd` service. The service runs as root, so it reads from `/etc/cloudflared`, not your home directory. Copy the config and credentials there:

```bash
sudo mkdir -p /etc/cloudflared
sudo cp ~/.cloudflared/config.yml ~/.cloudflared/<TUNNEL_UUID>.json /etc/cloudflared/
```

Edit `/etc/cloudflared/config.yml` so that `credentials-file` points to the new location:

```yaml
credentials-file: /etc/cloudflared/<TUNNEL_UUID>.json
```

Install and start the service:

```bash
sudo cloudflared --config /etc/cloudflared/config.yml service install
sudo systemctl enable --now cloudflared
systemctl status cloudflared
```

The service only restarts the tunnel. The app container must be running too: `docker:run` uses `--rm` and runs in the foreground, so it stops when that terminal closes.

| Command                                 | What it does                   |
| --------------------------------------- | ------------------------------ |
| `sudo systemctl restart cloudflared`    | Reload after editing the config |
| `journalctl -u cloudflared -f`          | Follow the tunnel logs         |
| `cloudflared tunnel info inventramed`   | List active connectors         |
| `sudo cloudflared service uninstall`    | Remove the service             |

## 9. Point the SMS worker at the public URL

The Raspberry Pi worker can now reach the server from any network over HTTPS:

```
POST https://inventramed.example.com/api/worker/sms/claim
POST https://inventramed.example.com/api/worker/sms/:id/result
Authorization: Bearer <WORKER_API_TOKEN>
```

These endpoints are now on the public internet. They reject every call without the bearer token, so make sure `WORKER_API_TOKEN` is a long random value (`openssl rand -base64 32`) and that `NEXTAUTH_SECRET` is set.

## Multiple apps on one tunnel

You don't need a tunnel per project. One tunnel (one `cloudflared` process) routes any number of hostnames to different local ports. Cloudflare matches each request's hostname against the ingress rules from top to bottom.

1. Run each app on its own port, for example InventraMed on `3000` and another app on `3001`.

2. Add one rule per hostname, above the catch-all, in `/etc/cloudflared/config.yml`:

   ```yaml
   tunnel: <TUNNEL_UUID>
   credentials-file: /etc/cloudflared/<TUNNEL_UUID>.json

   ingress:
     - hostname: inventramed.example.com
       service: http://localhost:3000
     - hostname: otherapp.example.com
       service: http://localhost:3001
     - hostname: api.example.com
       service: http://localhost:8080
     - service: http_status:404
   ```

3. Create a DNS record for each new hostname on the **same** tunnel:

   ```bash
   cloudflared tunnel route dns <TUNNEL_NAME> otherapp.example.com
   cloudflared tunnel route dns <TUNNEL_NAME> api.example.com
   ```

4. Validate the rules and restart the service:

   ```bash
   cloudflared tunnel --config /etc/cloudflared/config.yml ingress validate
   sudo systemctl restart cloudflared
   ```

Each hostname must be in a zone on the Cloudflare account you logged in to with `cloudflared tunnel login`. `route dns` uses `cert.pem`, which is tied to the domain you selected. For a hostname on a different domain, run `cloudflared tunnel login` again and select that domain, or add the `CNAME` record (`<TUNNEL_UUID>.cfargotunnel.com`, proxied) in the dashboard.

Create a separate tunnel only when the apps run on **different machines**. Each machine runs its own `cloudflared` with its own tunnel and config.

## No domain: Quick Tunnel

If you don't have a domain on Cloudflare, a Quick Tunnel gives you a random `https://<random-words>.trycloudflare.com` URL. You don't need a Cloudflare account, `tunnel login`, `config.yml` or DNS records. Install `cloudflared` (step 2), then:

1. Start the tunnel:

   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```

   Copy the `https://…trycloudflare.com` URL from the output.

2. Set it as the public URL in `apps/app/.env` and restart the app container (see [Set the public URL](#set-the-public-url)):

   ```dotenv
   NEXTAUTH_URL="https://<random-words>.trycloudflare.com"
   ```

3. To keep it running after you close the SSH session, run it inside `tmux` or `screen`, or in the background:

   ```bash
   nohup cloudflared tunnel --url http://localhost:3000 > ~/cloudflared-quick.log 2>&1 &
   grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' ~/cloudflared-quick.log
   ```

If `cloudflared` tries to use an existing `~/.cloudflared/config.yml` instead of starting a Quick Tunnel, move that file aside first.

Limitations:

| Limitation                                  | Effect on InventraMed |
| ------------------------------------------- | --------------------- |
| The URL changes every time `cloudflared` restarts | Update `NEXTAUTH_URL` and restart the container each time, or login breaks. Update the URL on the Pi worker too. |
| No uptime guarantee                         | Fine for demos and testing, not for daily SMS alerts. |
| At most 200 requests in flight; more get `429` | Not an issue at this app's scale. |
| No Server-Sent Events                       | The app doesn't use them today. |

For a URL that doesn't change, use a domain and a named tunnel (steps 3–8). Domains you add to Cloudflare can be registered anywhere, or bought through Cloudflare Registrar.

## Troubleshooting

| Symptom                                        | Likely cause and fix |
| ---------------------------------------------- | -------------------- |
| `502 Bad Gateway` / error 1033                 | The tunnel is up but nothing answers on `localhost:3000`, or the tunnel isn't running. Check `curl -I http://localhost:3000` and `systemctl status cloudflared`. |
| Login redirects to `localhost:3000`            | `NEXTAUTH_URL` still points to localhost. Set it to the `https://` hostname and restart the container. |
| Login loops back to the sign-in page           | `NEXTAUTH_URL` doesn't match the hostname in the browser exactly (scheme, subdomain), so the session cookie isn't sent. |
| `cloudflared` won't start: catch-all error     | The last ingress rule has a `hostname`. Add `- service: http_status:404` at the end. |
| Service can't find the config or credentials   | It runs as root and reads `/etc/cloudflared`. Copy the files there and fix `credentials-file` (step 8). |
| `route dns` fails: record already exists       | Delete the existing DNS record, or re-run with `--overwrite-dns`. |

## Remove the tunnel

```bash
sudo cloudflared service uninstall
cloudflared tunnel delete inventramed
```

Then delete the `inventramed.example.com` `CNAME` record in the Cloudflare dashboard, because `tunnel delete` doesn't remove it.

## References

- [Create a locally-managed tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/create-local-tunnel/)
- [Configuration file](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/configuration-file/)
- [Run as a service on Linux](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/as-a-service/linux/)
