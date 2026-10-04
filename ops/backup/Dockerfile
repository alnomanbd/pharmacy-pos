# Dawai's backups: the database and the uploads, every night and on request
# from the console, kept here for a week and sent off the server with rclone.
#
#   docker build -t dawai-backup ops/backup
#
# See docs/OPERATIONS.md, "Backups".
FROM alpine:3.20
RUN apk add --no-cache bash coreutils tar gzip tzdata mongodb-tools rclone
COPY backup.sh run.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/run.sh
ENV RCLONE_CONFIG=/config/rclone/rclone.conf
VOLUME ["/backups"]
CMD ["run.sh"]
