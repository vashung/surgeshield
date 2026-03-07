FROM python:3.11-slim

RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
    pandas==2.0.3 \
    numpy==1.24.3 \
    scikit-learn==1.3.0 \
    boto3==1.28.0 \
    s3fs==2023.6.0 \
    fsspec==2023.6.0

WORKDIR /opt/ml/processing

CMD ["python3"]
