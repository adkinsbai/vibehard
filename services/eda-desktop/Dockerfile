FROM ubuntu:26.04

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates dbus-x11 fonts-noto-cjk kicad kicad-symbols \
      kicad-footprints openbox python3-aiohttp tigervnc-standalone-server \
      xauth xdotool openjdk-25-jre-headless curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --uid 10001 --create-home --home-dir /home/eda --shell /usr/sbin/nologin eda \
    && install -d -o 10001 -g 10001 /data /opt/vibehard-eda

# Maven Central executable release, pinned to the digest verified by the native
# KiCad DSN/SES integration test. Never download code when a routing job runs.
RUN curl --fail --location --silent --show-error --retry 3 \
      https://repo.maven.apache.org/maven2/app/freerouting/freerouting/2.4.1/freerouting-2.4.1-executable.jar \
      --output /opt/vibehard-eda/freerouting.jar \
    && echo 'fb2e91df901fa50cd23a09ab42793af0ece4f3b1f3857d6724dd6f9c0c00be98  /opt/vibehard-eda/freerouting.jar' | sha256sum --check -

COPY --chown=10001:10001 server.py routing.py module_verify.py /opt/vibehard-eda/

ENV EDA_DESKTOP_CONTAINER=1 \
    EDA_DESKTOP_BIND=0.0.0.0 \
    EDA_DESKTOP_DATA=/data \
    EDA_DESKTOP_TOKEN_FILE=/run/eda-token \
    EDA_DESKTOP_PORT=6081 \
    HOME=/home/eda \
    QT_QPA_PLATFORM=xcb

USER 10001:10001
WORKDIR /opt/vibehard-eda
EXPOSE 6081
ENTRYPOINT ["python3", "/opt/vibehard-eda/server.py"]
