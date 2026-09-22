#!/usr/bin/env bash
# 阶段 A：一次性安装四端开发所需工具链（macOS arm64，仅装到用户目录，不需要 sudo）。
#
#   bash scripts/setup-toolchain.sh           # 全部
#   bash scripts/setup-toolchain.sh core      # 只装 Rust / Node / Go / JDK21
#   bash scripts/setup-toolchain.sh android   # 只装 Android SDK / NDK
#
# 脚本可重复运行：已装好的部分会跳过。

set -euo pipefail

STAGE="${1:-all}"
DL="$HOME/.cache/sakurareel-setup"
PREFIX="$HOME/.local"
ANDROID_SDK="$HOME/Library/Android/sdk"

NODE_VER="v24.9.0"
GO_VER="1.27.1"
JDK_VER="21.0.12.1"
JDK_TAG="${JDK_VER}+1"
CLT_ZIP="commandlinetools-mac-13114758_latest.zip"

mkdir -p "$DL"

log() { printf '\n==> %s\n' "$*"; }

# ---------------------------------------------------------------- core

install_rust() {
  if [ -x "$HOME/.cargo/bin/cargo" ]; then
    log "Rust 已装，跳过"
  else
    log "安装 Rust（stable, minimal）"
    curl -sSfL --retry 3 -o "$DL/rustup-init.sh" https://sh.rustup.rs
    sh "$DL/rustup-init.sh" -y --default-toolchain stable --profile minimal --no-modify-path
  fi

  log "安装交叉编译目标（iOS / Android）"
  "$HOME/.cargo/bin/rustup" target add \
    aarch64-apple-ios \
    aarch64-apple-ios-sim \
    aarch64-linux-android \
    armv7-linux-androideabi \
    x86_64-linux-android
}

install_node() {
  if [ -x "$PREFIX/node/bin/node" ]; then
    log "Node 已装，跳过"
    return
  fi
  log "安装 Node $NODE_VER"
  rm -f "$DL/node.tar.xz"
  curl -sSfL --retry 3 -o "$DL/node.tar.xz" \
    "https://registry.npmmirror.com/-/binary/node/latest-v24.x/node-$NODE_VER-darwin-arm64.tar.xz"
  mkdir -p "$PREFIX/node"
  tar -xf "$DL/node.tar.xz" -C "$PREFIX/node" --strip-components=1
}

install_go() {
  if [ -x "$PREFIX/go/bin/go" ]; then
    log "Go 已装，跳过"
    return
  fi
  log "安装 Go $GO_VER"
  rm -f "$DL/go.tar.gz"
  curl -sSfL --retry 3 -o "$DL/go.tar.gz" \
    "https://mirrors.aliyun.com/golang/go$GO_VER.darwin-arm64.tar.gz"
  mkdir -p "$PREFIX/go"
  tar -xzf "$DL/go.tar.gz" -C "$PREFIX/go" --strip-components=1
}

install_jdk() {
  if [ -x "$PREFIX/jdk-21/bin/java" ]; then
    log "JDK 21 已装，跳过"
    return
  fi
  log "安装 Temurin JDK ${JDK_VER}（给 Gradle 用；系统里的 JDK 26 太新）"
  rm -f "$DL/jdk21.tar.gz"
  curl -sSfL --retry 3 -o "$DL/jdk21.tar.gz" \
    "https://mirrors.tuna.tsinghua.edu.cn/Adoptium/21/jdk/aarch64/mac/OpenJDK21U-jdk_aarch64_mac_hotspot_${JDK_VER}_1.tar.gz"
  # Adoptium 的 mac 包是 .jdk bundle 结构（<版本>/Contents/Home/...），去掉三层拿到干净的 JAVA_HOME
  rm -rf "$PREFIX/jdk-21"
  mkdir -p "$PREFIX/jdk-21"
  tar -xzf "$DL/jdk21.tar.gz" -C "$PREFIX/jdk-21" --strip-components=3
}

# ------------------------------------------------------------- android

install_android() {
  local sdkm="$ANDROID_SDK/cmdline-tools/latest/bin/sdkmanager"

  if [ ! -x "$sdkm" ]; then
    log "安装 Android command line tools"
    rm -f "$DL/$CLT_ZIP"
    curl -sSfL --retry 3 -o "$DL/$CLT_ZIP" \
      "https://mirrors.cloud.tencent.com/AndroidSDK/$CLT_ZIP"
    rm -rf "$DL/clt" "$ANDROID_SDK/cmdline-tools/latest"
    mkdir -p "$DL/clt" "$ANDROID_SDK/cmdline-tools"
    unzip -q -o "$DL/$CLT_ZIP" -d "$DL/clt"
    mv "$DL/clt/cmdline-tools" "$ANDROID_SDK/cmdline-tools/latest"
  else
    log "Android command line tools 已装，跳过"
  fi

  export JAVA_HOME="$PREFIX/jdk-21"
  export ANDROID_HOME="$ANDROID_SDK"

  log "接受 SDK 许可协议"
  yes | "$sdkm" --sdk_root="$ANDROID_SDK" --licenses >"$DL/licenses.log" 2>&1 || true

  log "安装 platform-tools / platforms / build-tools（约 300MB）"
  "$sdkm" --sdk_root="$ANDROID_SDK" \
    "platform-tools" "platforms;android-36" "build-tools;36.0.0"

  if ls -d "$ANDROID_SDK/ndk/"* >/dev/null 2>&1; then
    log "NDK 已装，跳过"
    return
  fi

  log "挑一个 NDK 版本（优先 27.x）"
  local ndk
  ndk="$("$sdkm" --sdk_root="$ANDROID_SDK" --list 2>/dev/null \
    | tr -d ' ' | awk -F'|' '/^ndk;27\./ {print $1}' | sort -V | tail -1)"
  [ -n "$ndk" ] || ndk="$("$sdkm" --sdk_root="$ANDROID_SDK" --list 2>/dev/null \
    | tr -d ' ' | awk -F'|' '/^ndk;/ {print $1}' | sort -V | tail -1)"
  [ -n "$ndk" ] || { log "找不到可用的 NDK，跳过"; return; }

  log "安装 ${ndk}（约 1GB，最慢的一步）"
  "$sdkm" --sdk_root="$ANDROID_SDK" "$ndk"
}

# ----------------------------------------------------------------- run

case "$STAGE" in
  core)
    install_rust; install_node; install_go; install_jdk
    ;;
  android)
    install_jdk; install_android
    ;;
  all)
    install_rust; install_node; install_go; install_jdk; install_android
    ;;
  *)
    echo "用法: bash scripts/setup-toolchain.sh [all|core|android]" >&2
    exit 2
    ;;
esac

log "完成。版本核对："
export PATH="$PREFIX/node/bin:$PREFIX/go/bin:$HOME/.cargo/bin:$PATH"
for cmd in "cargo --version" "rustc --version" "node --version" "npm --version" \
           "go version" "$PREFIX/jdk-21/bin/java -version"; do
  printf '  %-34s ' "$cmd"
  $cmd 2>&1 | head -1 || echo "(未装好)"
done
printf '  %-34s ' "android sdk"
ls "$ANDROID_SDK" 2>/dev/null | tr '\n' ' ' || echo "(未装好)"
echo
