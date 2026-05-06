# Scaling Strategy: Remote Docker Hosts

## Context

ArcEval runs interactive coding sandboxes for hiring assessments. Each sandbox is a Docker container with a PTY-attached terminal session streamed over WebSocket. We need to scale beyond a single 8GB VM to support more concurrent candidates.

This document evaluates four approaches and explains why **Remote Docker Hosts** is the right choice for our current stage.

---

## The Approaches

### 1. Kubernetes (EKS)

Kubernetes is the industry standard for container orchestration at scale. AWS EKS provides a managed control plane.

**Why it doesn't fit us today:**

- **Control plane cost**: $75/month before a single container runs. That alone doubles our current infrastructure spend.
- **Steep learning curve**: K8s introduces concepts (pods, deployments, services, ingress controllers, persistent volume claims, RBAC, namespaces) that are irrelevant to our problem. We don't need rolling deployments or service meshes — we need to place sandbox containers on machines with free memory.
- **PTY problem**: Our sandboxes aren't typical K8s workloads. They require interactive `docker exec` with TTY attach. K8s exec works differently — it goes through the API server, and streaming PTY data through the K8s API adds latency and complexity.
- **Overkill for our scale**: K8s shines at 50+ nodes with dozens of microservices. We have one service that spawns ephemeral containers. The operational overhead of maintaining K8s (upgrades, node groups, CNI plugins, monitoring) far exceeds the scheduling benefit.
- **Workspace files**: K8s requires persistent volumes (EBS or EFS) for the `/workspace` bind mount. PV provisioning adds another moving part.

**When we'd revisit**: 20+ worker nodes, multiple regions, or if we add more microservices that benefit from K8s-native service discovery.

### 2. ECS (Fargate)

AWS ECS with Fargate eliminates server management entirely. Each sandbox would be a Fargate task.

**Why it doesn't fit us today:**

- **No `docker exec`**: Fargate tasks don't support traditional `docker exec`. ECS Exec exists (via SSM agent), but it adds ~2-3 seconds of connection latency and requires the SSM agent running inside the container. Our sandbox image would need modification, and the PTY streaming path changes completely.
- **Cold start latency**: Fargate tasks take 30-60 seconds to start (image pull + ENI attachment + task placement). Our current local spawn takes ~3 seconds. Candidates would wait significantly longer.
- **Code rewrite required**: The entire `docker-manager.ts` would need rewriting to use the AWS SDK instead of `dockerode`. The exec/PTY streaming, container lifecycle, and workspace seeding all change.
- **Cost at low scale**: Fargate charges per vCPU-second and GB-second. For always-on or long-running tasks (a 60-minute assessment), it costs more than reserved EC2 instances.
- **Networking complexity**: Each Fargate task gets its own ENI. The terminal server needs to reach each task's PTY stream, requiring VPC configuration, security groups per task, and potentially a service mesh.

**When we'd revisit**: If we need true auto-scaling (0 to 100 sandboxes in minutes) or want to eliminate all server management.

### 3. Docker Swarm

Docker Swarm is Docker's built-in clustering mode. Containers are scheduled across nodes using the same docker-compose file format.

**Why it doesn't fit us today:**

- **Services vs. one-off containers**: Swarm schedules "services" (long-running replicated containers). Our sandboxes are one-off, on-demand containers created via API calls. Swarm doesn't intercept `docker.createContainer()` — it only schedules containers created as Swarm services.
- **No cross-node `docker exec`**: You cannot `docker exec` into a container running on a different Swarm node from the one you're connected to. Our terminal server on VM1 couldn't exec into a sandbox on VM2. This is the same PTY problem that rules out K8s and ECS.
- **Workaround is worse than the alternative**: To use Swarm, each sandbox would need to be a 1-replica service, and we'd need to rearchitect terminal I/O to avoid exec entirely (e.g., have the sandbox connect back to the terminal server). This is more work than the Remote Docker Hosts approach.
- **Deprecated trajectory**: Docker has deprioritized Swarm in favor of Kubernetes. Community support, documentation updates, and bug fixes have slowed significantly. Building on Swarm is building on a shrinking foundation.

**When we'd revisit**: Never, realistically. The gap between Swarm and Remote Docker Hosts is small, but Swarm adds constraints without adding capabilities we need.

### 4. Remote Docker Hosts (Our Choice)

Keep the terminal server on VM1. Add worker VMs that expose their Docker daemon over TLS-secured TCP. The terminal server creates containers on remote hosts using the same `dockerode` library.

**Why this is the right fit:**

- **Zero architecture change**: `dockerode` supports remote Docker daemons natively. The same `createContainer()`, `exec()`, and PTY streaming code works over TCP exactly as it does over the local Unix socket. No rewrite needed.
- **PTY works unchanged**: `docker exec` over TCP returns the same bidirectional stream as the local socket. The candidate's terminal session is identical whether the sandbox runs locally or on a remote host.
- **Minutes to add a node**: Launch an EC2 instance, install Docker, configure TLS, pull the sandbox image, add the host IP to an env var. No orchestrator to learn, no control plane to maintain.
- **Minimal code change**: The only modification is in `docker-manager.ts` — replace the single Docker client with a pool of clients, and add a host-selection function (least-loaded). Everything else in the codebase is untouched.
- **Predictable cost**: Just EC2 instances. No control plane fees, no per-task charges, no NAT gateway costs. Three 8GB instances = ~$105/month for 15 concurrent sandboxes.
- **Graceful fallback**: If a worker node goes down, the terminal server stops placing containers on it and uses remaining hosts. No complex failover logic — just a health check per host.

---

## Architecture Comparison

```
Kubernetes / ECS / Swarm:
  Terminal Server → Orchestrator API → Scheduler → Node → Container
                    (new abstraction)   (new component)

Remote Docker Hosts:
  Terminal Server → Docker API (same as today) → Container
                    (just TCP instead of Unix socket)
```

The critical insight: **we don't need a scheduler**. Our terminal server already _is_ the scheduler. It already tracks active sessions, enforces concurrency limits, and queues excess requests. Adding an orchestrator between the terminal server and Docker would mean two layers of scheduling with no added benefit.

---

## Setup Time Comparison

| Approach | Estimated Setup Time | Ongoing Maintenance |
|---|---|---|
| Kubernetes (EKS) | 2-3 weeks | High (upgrades, node groups, monitoring) |
| ECS (Fargate) | 1-2 weeks | Medium (task definitions, networking, IAM) |
| Docker Swarm | 3-5 days | Low-Medium (cert rotation, image distribution) |
| **Remote Docker Hosts** | **1-2 days** | **Minimal (TLS certs, image pulls)** |

### What "1-2 days" looks like:

**Day 1 — Infrastructure:**
- Launch 2 EC2 instances in same VPC/subnet
- Install Docker on each
- Generate TLS CA + certs (one-time, scripted)
- Configure Docker daemon for TLS remote access
- Pull `hiring-sandbox` image on each worker
- Set up EFS mount for shared `/tmp/sessions/` (optional)

**Day 2 — Code:**
- Refactor `docker-manager.ts` to support host pool
- Add `DOCKER_HOSTS` env var parsing
- Add per-host health checks
- Test: spawn sandboxes on remote hosts, verify PTY streaming
- Deploy

---

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Worker node dies mid-session | Session is lost (same as today if VM1 dies). Candidate can reconnect and get a new sandbox. |
| TLS cert expiry | Automate cert rotation with a cron job or use long-lived certs (1 year). |
| Docker daemon vulnerability | Workers are in a private subnet, only accessible from VM1. Security groups restrict port 2376 to VM1's IP. |
| Sandbox image out of sync | Script `docker pull` on all workers as part of deploy process. |
| VM1 is single point of failure | True for all approaches at our scale. Addressed in Phase 3 (HA) if needed. |

---

## Migration Path to Larger Scale

Remote Docker Hosts is not a dead end. It's a stepping stone:

```
Phase 1 (current): Single VM, 5 concurrent sandboxes
Phase 2 (next):    Remote Docker Hosts, 15-25 concurrent sandboxes
Phase 3 (future):  ECS or EKS, 50+ concurrent, auto-scaling
```

The refactoring done in Phase 2 (host pool abstraction in `docker-manager.ts`) makes Phase 3 easier: replacing the Docker host pool with ECS `RunTask` calls is a localized change in the same file, not a full rewrite.

---

## Decision

**We choose Remote Docker Hosts** because it solves the immediate scaling need (more concurrent sandboxes) with the least disruption to our working architecture. The PTY streaming — the hardest part of our system — works unchanged. The setup is measurable in hours, not weeks. And when we outgrow it, the migration path to ECS/EKS is clear and incremental.
