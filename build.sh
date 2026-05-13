#!/bin/bash
set -e

IMAGE="blog.pablogeorge.org:latest"

echo "▶ Building Docker image..."
docker build -t "$IMAGE" .

echo "▶ Loading image into k3s..."
docker save "$IMAGE" | sudo k3s ctr images import -

echo "▶ Applying manifests..."
kubectl apply -f k8s/

echo "▶ Rolling restart..."
kubectl rollout restart deployment/blog

echo "▶ Waiting for rollout..."
kubectl rollout status deployment/blog

echo ""
echo "✓ Done. Running pods:"
kubectl get pods -l app=blog
