FROM nginx:alpine
ENV API_UPSTREAM=http://host.docker.internal:8098
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY public/ /usr/share/nginx/html/
EXPOSE 80
