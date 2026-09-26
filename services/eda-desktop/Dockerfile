FROM ubuntu:26.04

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates dbus-x11 fonts-noto-cjk kicad kicad-symbols \
      kicad-footprints openbox python3-aiohttp tigervnc-standalone-server \
      xauth xdotool \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --uid 10001 --create-home --home-dir /home/eda --shell /usr/sbin/nologin eda \
    && install -d -o 10001 -g 10001 /data /opt/vibehard-eda

COPY --chown=10001:10001 server.py /opt/vibehard-eda/server.py

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
