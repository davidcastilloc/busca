FROM python:3.12-slim

WORKDIR /app

COPY scraper.py .

RUN mkdir -p data

VOLUME ["/app/data"]

ENTRYPOINT ["python", "scraper.py"]
