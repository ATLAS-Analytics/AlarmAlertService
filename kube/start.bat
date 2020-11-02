REM if needed create cert manager
REM kubectl apply --validate=false -f https://github.com/jetstack/cert-manager/releases/download/v1.0.3/cert-manager.yaml

kubectl delete namespace aaasf
kubectl create namespace aaasf


kubectl delete secret -n aaasf globus-secret
kubectl create secret -n aaasf generic globus-secret --from-file=globus-config.json=secrets/globus-config.json

kubectl delete secret -n aaasf config
kubectl create secret -n aaasf generic config --from-file=config.json=secrets/config.json

kubectl delete secret -n aaasf mg-config
kubectl create secret -n aaasf generic mg-config --from-file=mg-config.json=secrets/mg-config.json

kubectl delete -f frontend.yaml
kubectl create -f frontend.yaml

START /B kubectl port-forward service/aaasf 80:80