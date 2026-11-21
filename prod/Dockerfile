# syntax=docker/dockerfile:1
# Production image for the Brave Frontier server emulator (Seltraeh/server).
# Build context: a directory holding server/ (source), .vcpkg-downloads/ and prod/.
#   docker build -f prod/Dockerfile -t bf-server:prod .

# ---------- build ----------
FROM ubuntu:24.04 AS build

ARG DEBIAN_FRONTEND=noninteractive
ARG VCPKG_COMMIT=efa4634bd526b87559684607d2cbbdeeec0f07d8
ARG JOBS=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential g++-14 gcc-14 ninja-build git curl ca-certificates \
        zip unzip tar pkg-config python3 python3-venv \
        autoconf automake autoconf-archive libtool bison flex perl linux-libc-dev \
    && rm -rf /var/lib/apt/lists/* \
    && update-alternatives --install /usr/bin/gcc gcc /usr/bin/gcc-14 100 \
    && update-alternatives --install /usr/bin/g++ g++ /usr/bin/g++-14 100

RUN python3 -m venv /opt/cmake && /opt/cmake/bin/pip install --no-cache-dir "cmake>=4.0,<5" \
    && ln -s /opt/cmake/bin/cmake /usr/local/bin/cmake

ENV RUSTUP_HOME=/opt/rustup CARGO_HOME=/opt/cargo PATH=/opt/cargo/bin:$PATH
RUN curl -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain stable

ENV VCPKG_ROOT=/opt/vcpkg VCPKG_FORCE_SYSTEM_BINARIES=1 VCPKG_DOWNLOADS=/opt/vcpkg-downloads
RUN mkdir -p /opt/vcpkg-downloads \
    && git clone https://github.com/microsoft/vcpkg.git /opt/vcpkg \
    && git -C /opt/vcpkg checkout ${VCPKG_COMMIT} \
    && /opt/vcpkg/bootstrap-vcpkg.sh -disableMetrics

# Seeded sources (e.g. zlib 1.3.1, whose GitHub archive URL now 404s).
COPY .vcpkg-downloads/ /opt/vcpkg-downloads/

# Dependencies first so source edits do not rebuild them.
WORKDIR /src
COPY server/vcpkg.json server/vcpkg-configuration.json ./
RUN /opt/vcpkg/vcpkg install --x-install-root=/opt/vcpkg_installed --triplet x64-linux-release

COPY server/ /src/
# /build is a BuildKit cache mount: object files survive between image builds,
# so a source change only recompiles what it touches.
RUN --mount=type=cache,target=/build \
    cmake -S /src -B /build -G Ninja \
        -DCMAKE_BUILD_TYPE=Release \
        -DCMAKE_TOOLCHAIN_FILE=/opt/vcpkg/scripts/buildsystems/vcpkg.cmake \
        -DVCPKG_TARGET_TRIPLET=x64-linux-release \
        -DVCPKG_INSTALLED_DIR=/opt/vcpkg_installed \
        -DVCPKG_MANIFEST_INSTALL=OFF \
        -DGIMUSRV_FRONTEND=STANDALONE \
        -DGIMU_ENABLE_DEBUG_CLI=OFF \
        -DCMAKE_C_FLAGS=-march=x86-64-v3 \
        -DCMAKE_CXX_FLAGS=-march=x86-64-v3 \
    && cmake --build /build --parallel ${JOBS} \
    && install -D -s /build/standalone_frontend/gimuserverw /out/gimuserverw

# ---------- runtime ----------
FROM ubuntu:24.04

# tcmalloc instead of glibc malloc (LD_PRELOAD below): a request's memory is
# freed on another thread than the one that built it, and glibc's arena locks
# for that cost ~8% of the server's CPU.  +17% req/s on the 4-CPU bench for
# ~23 MiB more RSS.  Roll back without a rebuild: LD_PRELOAD= in the
# service's environment.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates tzdata \
        libtcmalloc-minimal4t64 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 10001 --home /app --shell /usr/sbin/nologin bf \
    && install -d -o bf -g bf /data

WORKDIR /app
COPY --from=build /out/gimuserverw /app/gimuserverw
COPY server/deploy/mst/ /app/mst/
COPY server/deploy/system/ /app/system/
COPY server/deploy/archive/ /app/archive/
COPY prod/config.json /app/config.json
RUN mkdir -p /app/game_content/content /app/game_content/mst /app/balance

ENV TZ=Asia/Tokyo
ENV LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libtcmalloc_minimal.so.4
USER bf
EXPOSE 9960
VOLUME ["/data"]
ENTRYPOINT ["/app/gimuserverw", "/app/config.json"]
