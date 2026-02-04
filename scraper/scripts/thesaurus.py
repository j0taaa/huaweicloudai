# Huawei Cloud Query Expansion Thesaurus
# Maps terms to their expansions for better search relevance

TERMS = {
    # Authentication & Security
    "authentication": ["identity", "access", "management", "iam", "ak", "sk", "token", "credential", "login", "sign-in"],
    "api": ["application programming interface", "restful", "rest", "sdk", "endpoint", "api-gateway", "apig"],
    "security": ["protection", "encryption", "firewall", "ddos", "anti-ddos", "waf", "security group"],
    "authorization": ["permission", "policy", "role", "privilege", "access control"],
    
    # Compute Services
    "ecs": ["elastic cloud server", "virtual machine", "vm", "cloud server", "compute", "instance"],
    "instance": ["virtual machine", "vm", "server", "compute node"],
    "server": ["instance", "vm", "host", "node"],
    "scaling": ["auto-scaling", "autoscaling", "as", "elastic scaling", "scale-out", "scale-in"],
    
    # Storage Services
    "storage": ["object storage", "block storage", "file storage", "disk", "volume"],
    "obs": ["object storage service", "s3", "bucket", "object", "file storage", "aws s3", "amazon s3"],
    "evs": ["elastic volume service", "block storage", "disk", "volume", "storage device"],
    "sfs": ["scalable file service", "nas", "network-attached storage", "file system"],
    "backup": ["snapshot", "restore", "recovery", "archive"],
    
    # Network Services
    "vpc": ["virtual private cloud", "private network", "virtual network", "subnet"],
    "network": ["vpc", "subnet", "router", "gateway", "bandwidth", "eip", "elastic ip"],
    "subnet": ["network segment", "ip range", "cidr", "network partition"],
    "eip": ["elastic ip", "public ip", "elastic ip address", "static ip"],
    "load balancer": ["elb", "elastic load balance", "traffic distribution", "load balancing"],
    "elb": ["load balancer", "elastic load balance", "traffic management"],
    "cdn": ["content delivery network", "distribution", "acceleration", "edge cache"],
    
    # Database Services
    "database": ["db", "rdbms", "relational database", "data store", "repository"],
    "rds": ["relational database service", "mysql", "postgresql", "sql server", "mariadb"],
    "mysql": ["relational database", "rds", "database", "data"],
    "postgresql": ["postgres", "relational database", "rds"],
    "taurusdb": ["mysql", "relational database", "gaussdb", "mysql-compatible"],
    "gaussdb": ["postgresql", "mysql", "relational database", "distributed database"],
    "nosql": ["cassandra", "mongodb", "redis", "document database", "key-value", "graph"],
    "redis": ["cache", "key-value", "memory database", "in-memory"],
    "dds": ["document database service", "mongodb", "nosql", "document store"],
    "dws": ["data warehouse service", "analytics", "olap", "data warehouse"],
    
    # AI & Analytics
    "ai": ["artificial intelligence", "machine learning", "ml", "deep learning", "model"],
    "model": ["ai", "machine learning", "training", "inference", "prediction"],
    "training": ["machine learning", "model development", "neural network"],
    "inference": ["prediction", "model serving", "ml inference"],
    "mrs": ["mapreduce service", "hadoop", "spark", "big data", "data processing"],
    
    # Container & Serverless
    "cce": ["cloud container engine", "kubernetes", "k8s", "container", "orchestration"],
    "kubernetes": ["k8s", "container", "orchestration", "cce"],
    "swr": ["software repository for container", "container registry", "docker", "image"],
    "docker": ["container", "image", "containerization"],
    "function": ["serverless", "functiongraph", "fgs", "lambda", "cloud function"],
    "serverless": ["functiongraph", "fgs", "cloud function", "event-driven"],
    
    # Management & DevOps
    "monitor": ["cloud eye", "ces", "monitoring", "metrics", "alarm", "alert"],
    "cloud eye": ["ces", "monitoring", "metric", "alarm"],
    "ces": ["cloud eye", "monitoring", "metrics"],
    "log": ["cloud trace service", "cts", "logging", "log collection", "audit"],
    "cts": ["cloud trace service", "audit", "log"],
    "aom": ["application operations management", "devops", "operations", "monitoring"],
    "devops": ["ci/cd", "pipeline", "deployment", "automation", "aom", "codearts"],
    "codearts": ["devops", "ci/cd", "deployment", "codehub"],
    
    # Middleware & Messaging
    "message": ["kafka", "dms", "mq", "queue", "topic"],
    "dms": ["distributed message service", "kafka", "rabbitmq", "mq"],
    "kafka": ["message queue", "stream", "event streaming", "dms"],
    "rabbitmq": ["message queue", "mq", "dms"],
    "api gateway": ["apig", "api-gateway", "api proxy", "gateway"],
    
    # Edge & IoT
    "iot": ["internet of things", "device", "sensor", "edge"],
    "edge": ["edge computing", "iot edge", "edge node"],
    
    # Common Operations
    "create": ["provision", "launch", "deploy", "set up", "initialize", "start"],
    "delete": ["remove", "destroy", "terminate", "clean up", "remove"],
    "update": ["modify", "change", "edit", "alter", "upgrade"],
    "configure": ["setup", "configure", "setting", "configuration", "parameter"],
    "deploy": ["create", "launch", "install", "provision", "set up"],
    "manage": ["administer", "control", "operate", "maintain"],
    "troubleshoot": ["debug", "fix", "resolve", "problem-solving", "error"],
    "error": ["exception", "failure", "issue", "problem", "bug"],
    
    # Pricing & Billing
    "price": ["cost", "pricing", "billing", "fee", "charge", "payment", "free tier", "tier"],
    "billing": ["cost", "pricing", "payment", "invoice", "account", "subscription"],
    "quota": ["limit", "restriction", "threshold", "maximum", "cap"],
    "limit": ["quota", "restriction", "threshold", "capacity", "constraint"],
    "free tier": ["free", "tier", "trial", "free account"],
    "tier": ["level", "edition", "plan", "package"],
    
    # Performance
    "performance": ["speed", "throughput", "latency", "optimization", "tune"],
    "optimize": ["improve", "tune", "enhance", "boost", "accelerate"],
    "latency": ["delay", "response time", "lag"],
    
    # Migration
    "migrate": ["transfer", "move", "import", "export", "migration"],
    "migration": ["transfer", "move", "import", "export"],
    "import": ["ingest", "load", "upload"],
    "export": ["download", "save", "extract"],
    
    # Security & Compliance
    "encrypt": ["encryption", "secure", "protect", "cipher", "ssl", "tls"],
    "firewall": ["security group", "network security", "access control"],
    "security group": ["firewall", "network acl", "access control list", "acl"],
    "ssl": ["certificate", "tls", "https", "secure", "encryption"],
    "certificate": ["ssl", "tls", "security", "credential", "cert"],
    "tls": ["ssl", "certificate", "secure", "encryption"],
    
    # Documentation Types
    "api reference": ["api-doc", "api-documentation", "sdk", "endpoint"],
    "user guide": ["guide", "tutorial", "how-to", "manual"],
    "best practice": ["recommendation", "guideline", "standard", "pattern"],
}

# Document type boost factors
# Different document types are more relevant for different query types
DOCUMENT_TYPE_BOOSTS = {
    # For "how to" questions
    "guide": 1.5,
    "tutorial": 1.5,
    "user guide": 1.5,
    
    # For API/technical questions
    "api": 1.8,
    "api reference": 1.8,
    "sdk": 1.6,
    
    # For troubleshooting/error questions
    "troubleshooting": 2.0,
    "error": 2.0,
    "faq": 1.7,
    
    # For pricing questions
    "pricing": 2.0,
    "cost": 2.0,
    "billing": 2.0,
    
    # For best practices
    "best practice": 1.8,
    "recommendation": 1.6,
}

# Service priority weights for query terms
# When query contains these terms, boost matching services
SERVICE_KEYWORD_BOOSTS = {
    # Authentication & Security
    "authentication": {"iam": 5.0, "security": 3.0, "identity": 4.0},
    "identity": {"iam": 5.0, "identitycenter": 3.0},
    "access control": {"iam": 4.0, "security": 2.5},
    "api": {"apig": 2.0, "iam": 1.5},
    "ak": {"iam": 3.0},
    "sk": {"iam": 3.0},
    
    # Compute Services
    "ecs": {"ecs": 5.0, "sms": 0.1, "ims": 0.1},
    "elastic cloud server": {"ecs": 5.0},
    "instance": {"ecs": 4.0, "cce": 2.0, "rds": 2.0},
    "virtual machine": {"ecs": 5.0},
    "vm": {"ecs": 4.0},
    "compute": {"ecs": 3.0, "cce": 2.0},
    
    # Storage Services
    "storage": {"obs": 2.0, "evs": 2.0, "sfs": 1.5},
    "obs": {"obs": 5.0},
    "object storage": {"obs": 5.0},
    "bucket": {"obs": 5.0},
    "evs": {"evs": 5.0},
    "block storage": {"evs": 4.0},
    "volume": {"evs": 5.0},
    "disk": {"evs": 4.0},
    "sfs": {"sfs": 5.0},
    "nas": {"sfs": 4.0},
    
    # Network Services
    "vpc": {"vpc": 5.0},
    "virtual private cloud": {"vpc": 5.0},
    "network": {"vpc": 3.0, "elb": 2.0},
    "load balancer": {"elb": 5.0},
    "loadbalancer": {"elb": 5.0},
    "elb": {"elb": 5.0},
    "cdn": {"cdn": 5.0},
    
    # Database Services
    "database": {"rds": 3.0, "taurusdb": 2.5, "gaussdb": 2.5, "dds": 2.0},
    "rds": {"rds": 5.0},
    "mysql": {"rds": 5.0, "taurusdb": 4.0},
    "postgresql": {"gaussdb": 5.0, "rds": 3.0},
    "sql": {"rds": 3.0},
    "nosql": {"dds": 4.0, "redis": 4.0, "dcs": 4.0},
    "redis": {"dcs": 5.0, "redis": 5.0},
    "cache": {"dcs": 5.0, "redis": 5.0},
    "mongodb": {"dds": 5.0},
    "taurusdb": {"taurusdb": 5.0},
    "gaussdb": {"gaussdb": 5.0},
    "dds": {"dds": 5.0},
    "dcs": {"dcs": 5.0},
    
    # AI & Analytics
    "ai": {"modelarts": 3.0},
    "machine learning": {"modelarts": 5.0},
    "modelarts": {"modelarts": 5.0},
    
    # Container & Serverless
    "kubernetes": {"cce": 5.0},
    "k8s": {"cce": 5.0},
    "container": {"cce": 4.0, "swr": 2.0},
    "cce": {"cce": 5.0},
    "docker": {"swr": 3.0},
    "serverless": {"functiongraph": 4.0},
    "function": {"functiongraph": 3.0},
    "functiongraph": {"functiongraph": 5.0},
    
    # Management & DevOps
    "monitoring": {"ces": 3.0, "aom": 3.0},
    "ces": {"ces": 5.0},
    "aom": {"aom": 5.0},
    "log": {"cts": 3.0, "lts": 3.0},
    "devops": {"codearts": 4.0, "aom": 2.0},
    "codearts": {"codearts": 5.0},
    
    # Middleware & Messaging
    "kafka": {"dms": 5.0},
    "message": {"dms": 3.0},
    "dms": {"dms": 5.0},
    
    # Edge & IoT
    "iot": {"iotda": 4.0},
    
    # Penalty boosts (reduce score for clearly wrong services)
    "server migration": {"sms": 0.1},
    "migration": {"sms": 0.5},
    "image": {"ims": 2.0, "swr": 1.5},
    "docker": {"swr": 5.0, "cci": 2.0},
    "snapshot": {"evs": 3.0, "obs": 2.5, "rds": 2.0},
    "backup": {"evs": 2.5, "obs": 2.5, "rds": 3.0, "functiongraph": 2.0},
    "nat": {"natgateway": 5.0},
    "certificate": {"scm": 4.0, "ccm": 3.0, "elb": 2.5, "cdn": 2.0},
    "security group": {"vpc": 5.0},
    "firewall": {"vpc": 4.0, "elb": 2.0},
    "s3": {"obs": 5.0},
    "aws s3": {"obs": 5.0},
    "amazon s3": {"obs": 5.0},
    "kafka": {"dms": 4.0},
    "message": {"dms": 3.0},
    "rabbitmq": {"dms": 4.0},
    "function": {"functiongraph": 4.0, "fgs": 3.0},
    "serverless": {"functiongraph": 5.0},
}

def expand_query(query: str) -> str:
    """
    Expand query with related terms from thesaurus
    """
    words = query.lower().split()
    expanded = [query]  # Always include original query
    
    for word in words:
        word = word.strip(".,!?;:")
        if word in TERMS:
            for term in TERMS[word]:
                expanded.append(term)
    
    return " ".join(expanded)

def get_service_boost(query: str, service: str) -> float:
    """
    Get boost factor for a service based on query keywords
    """
    query_lower = query.lower()
    boost = 1.0
    
    for keyword, service_boosts in SERVICE_KEYWORD_BOOSTS.items():
        if keyword in query_lower and service in service_boosts:
            boost *= service_boosts[service]
    
    return boost

def get_document_type_boost(query: str, doc_type: str = None) -> float:
    """
    Get boost factor for document type based on query type
    """
    if doc_type is None:
        return 1.0
    
    query_lower = query.lower()
    boost = 1.0
    
    # Detect query type
    is_how_to = any(w in query_lower for w in ["how", "create", "set up", "deploy", "install"])
    is_troubleshoot = any(w in query_lower for w in ["error", "fail", "problem", "issue", "troubleshoot", "fix"])
    is_pricing = any(w in query_lower for w in ["price", "cost", "billing", "fee"])
    is_api = any(w in query_lower for w in ["api", "sdk", "endpoint", "reference"])
    is_best_practice = any(w in query_lower for w in ["best", "practice", "recommend", "optimize"])
    
    # Apply boosts
    if is_how_to and doc_type.lower() in ["guide", "tutorial", "user guide"]:
        boost *= DOCUMENT_TYPE_BOOSTS.get("guide", 1.0)
    elif is_troubleshoot and doc_type.lower() in ["troubleshooting", "error", "faq"]:
        boost *= DOCUMENT_TYPE_BOOSTS.get("troubleshooting", 1.0)
    elif is_pricing and doc_type.lower() in ["pricing", "cost", "billing"]:
        boost *= DOCUMENT_TYPE_BOOSTS.get("pricing", 1.0)
    elif is_api and doc_type.lower() in ["api", "api reference", "sdk"]:
        boost *= DOCUMENT_TYPE_BOOSTS.get("api", 1.0)
    elif is_best_practice and doc_type.lower() in ["best practice", "recommendation"]:
        boost *= DOCUMENT_TYPE_BOOSTS.get("best practice", 1.0)
    
    return boost