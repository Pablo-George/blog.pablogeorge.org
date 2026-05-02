#!/bin/bash
set -e

echo "Building Docker image..."
docker build -t blog.pablogeorge.org:latest .

echo "Loading image into k3s..."
sudo k3s ctr images import <(docker save blog.pablogeorge.org:latest)

echo "Applying Kubernetes manifests..."
kubectl apply -f k8s/

echo "Deployment complete!"
kubectl get pods -l app=blog
