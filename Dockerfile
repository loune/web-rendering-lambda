FROM debian:stretch

RUN apt-get update \
  && apt-get install -y curl \
  && curl -sL https://deb.nodesource.com/setup_10.x | bash - \
  && curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | apt-key add - \
  && echo "deb https://dl.yarnpkg.com/debian/ stable main" | tee /etc/apt/sources.list.d/yarn.list \
  && apt-get update \
  && apt-get install -y build-essential nodejs yarn

RUN apt-get install -y libappindicator3-1 fonts-liberation libasound2 libnspr4 libnss3 libxss1 wget xdg-utils \
  && curl -O https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb \
  && dpkg -i google-chrome*.deb \
  && rm google-chrome*.deb \
  && apt-get autoremove -y && apt-get clean && rm -rf /var/lib/apt/lists/*

COPY . /app
WORKDIR /app

EXPOSE 8008/tcp
ENV IS_DOCKER=1

RUN yarn && yarn compile-production

CMD ["yarn", "start-prod"]
