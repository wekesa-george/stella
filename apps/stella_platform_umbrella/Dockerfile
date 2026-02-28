# ==============================================================
# Stella Platform Umbrella — Multi-stage Docker build
# Deploys admin_gateway + trade_engine as a single BEAM release
# ==============================================================

# ── Stage 1: Builder ──────────────────────────────────────────
FROM elixir:1.18-slim AS builder

# Install build dependencies (bcrypt_elixir and nx need gcc/make)
RUN apt-get update -y && \
    apt-get install -y build-essential git curl && \
    apt-get clean && rm -f /var/lib/apt/lists/*_*

# Node.js is required by ccxtex (CCXT Elixir wrapper) at compile + runtime
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && rm -f /var/lib/apt/lists/*_*

WORKDIR /app

# Install hex + rebar
RUN mix local.hex --force && \
    mix local.rebar --force

ENV MIX_ENV="prod"

# ── Dependencies ──────────────────────────────────────────────
# Copy only dependency-related files first for better layer caching
COPY mix.exs mix.lock ./
COPY apps/admin_gateway/mix.exs apps/admin_gateway/mix.exs
COPY apps/trade_engine/mix.exs apps/trade_engine/mix.exs

RUN mix deps.get --only $MIX_ENV

# ── Config ────────────────────────────────────────────────────
# Copy compile-time config before compiling deps
RUN mkdir -p config
COPY config/config.exs config/prod.exs config/
COPY apps/trade_engine/config/ apps/trade_engine/config/

RUN mix deps.compile

# ── Application code ──────────────────────────────────────────
COPY apps/admin_gateway/lib apps/admin_gateway/lib
COPY apps/admin_gateway/priv apps/admin_gateway/priv
COPY apps/trade_engine/lib apps/trade_engine/lib
COPY apps/trade_engine/priv apps/trade_engine/priv

RUN mix compile

# ── Runtime config (doesn't trigger recompilation) ────────────
COPY config/runtime.exs config/

# ── Build release ─────────────────────────────────────────────
RUN mix release

# ── Stage 2: Runner ───────────────────────────────────────────
# Must use same base as elixir:1.18-slim (Debian Trixie) for GLIBC compatibility
FROM debian:trixie-slim AS runner

RUN apt-get update -y && \
    apt-get install -y libstdc++6 openssl libncurses6 locales ca-certificates curl && \
    apt-get clean && rm -f /var/lib/apt/lists/*_*

# Node.js required at runtime by ccxtex (spawns node process for CCXT)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && rm -f /var/lib/apt/lists/*_*

# Set locale
RUN sed -i '/en_US.UTF-8/s/^# //g' /etc/locale.gen && locale-gen

ENV LANG=en_US.UTF-8
ENV LANGUAGE=en_US:en
ENV LC_ALL=en_US.UTF-8

WORKDIR /app
RUN chown nobody /app

ENV MIX_ENV="prod"

# Copy the release from builder
COPY --from=builder --chown=nobody:root /app/_build/prod/rel/stella_platform_umbrella ./

USER nobody

# Default env vars (override at runtime)
ENV PHX_SERVER=true
ENV PORT=4000

EXPOSE 4000

CMD ["/app/bin/stella_platform_umbrella", "start"]
