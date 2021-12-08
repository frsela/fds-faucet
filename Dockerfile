# Default value can be updated at build-time (--build-arg ARG) and passed to ENV variables
ARG APP_ROOT="/opt"
ARG APP_PORT=3000

FROM node:14-alpine AS builder

ARG APP_ROOT
ARG APP_PORT

WORKDIR ${APP_ROOT}

COPY package.json yarn.lock ./
RUN yarn --production

COPY index.js ./index.js

FROM node:14-alpine

ARG APP_ROOT
ARG APP_PORT

COPY --from=builder ${APP_ROOT} ${APP_ROOT}

USER node
WORKDIR ${APP_ROOT}

EXPOSE ${APP_PORT}

CMD [ "yarn", "start" ]
