FROM docker.io/library/nginx:alpine

RUN rm -f /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/default.conf

WORKDIR /usr/share/nginx/html

COPY *.html ./
COPY ["Foto sito Irene Monticelli", "./Foto sito Irene Monticelli"]

EXPOSE 3017

CMD ["nginx", "-g", "daemon off;"]
