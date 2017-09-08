FROM node
ADD . /app
WORKDIR /app
RUN npm install
EXPOSE 80
EXPOSE 443
CMD node src/server-from-config-file
