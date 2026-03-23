#!/usr/bin/env python3
"""
HYL Media - Architecture Diagram

Generates AWS architecture diagram using Python diagrams library.

Usage:
    python3 docs/architecture/generate.py

Requirements:
    pip3 install --break-system-packages diagrams
    sudo apt-get install -y graphviz

Output:
    docs/architecture/hyl_media_architecture.png
"""

from pathlib import Path

from diagrams import Cluster, Diagram, Edge
from diagrams.aws.database import Dynamodb
from diagrams.aws.integration import Appsync
from diagrams.aws.network import CloudFront
from diagrams.aws.security import Cognito
from diagrams.aws.storage import S3
from diagrams.aws.devtools import CommandLineInterface
from diagrams.onprem.client import User
from diagrams.programming.framework import React

SCRIPT_DIR = Path(__file__).parent
OUTPUT_FILE = SCRIPT_DIR / "hyl_media_architecture"

graph_attr = {
    "fontsize": "16",
    "bgcolor": "white",
    "pad": "0.8",
    "nodesep": "1.0",
    "ranksep": "1.2",
    "labeljust": "l",
}

node_attr = {
    "fontsize": "9",
}

edge_attr = {
    "fontsize": "8",
    "color": "#444444",
}

with Diagram(
    "HYL Media — Architecture\nAmplify App: d2r70lavusnzlx | Account: 299025166536 | eu-central-1",
    filename=str(OUTPUT_FILE),
    show=False,
    direction="TB",
    graph_attr=graph_attr,
    node_attr=node_attr,
    edge_attr=edge_attr,
):
    user = User("Browser\njiri.hylmar@gmail.com")

    with Cluster("Amplify Hosting\nhttps://main.d2r70lavusnzlx.amplifyapp.com"):
        cloudfront = CloudFront("CloudFront\nSPA + custom\nrewrite rules")
        react = React("React + TypeScript\n+ Amplify UI\n(Vite build)")

    with Cluster("Amplify Gen 2 Backend (AppSync)"):
        cognito = Cognito("Cognito User Pool\neu-central-1_GJhwO2ww5\nemail/password auth")
        appsync = Appsync("AppSync GraphQL\n366ya64s65cqjhilw34nx5r2vu\nauto-generated CRUD")

    with Cluster("DynamoDB"):
        dynamodb = Dynamodb("KnowledgeGraphItem-\ng7elqzchivgt3g2i2zs6rfn64u-NONE\n\n905 items (single-table)\n6 GSIs: byType, byCastMovie,\nbyPersonFilm, byRecording,\nbyPerformer, byLanguage")

    with Cluster("S3 Buckets (3 — all managed by Amplify stack)"):
        s3_storage = S3("hylmediastoragebucketefb-*\n\nUser content:\nlibrary/ (307 books)\nsheet-music/ (112 PDFs)")
        s3_codegen = S3("amplifydataamplifycodege-*\n\nAmplify internal:\nCodeGen artifacts")
        s3_schema = S3("modelintrospectionschema-*\n\nAmplify internal:\nGraphQL schema\nintrospection")

    # User flow
    user >> Edge(label="HTTPS") >> cloudfront
    cloudfront >> Edge(label="serves") >> react
    react >> Edge(label="Amplify Auth") >> cognito
    cognito >> Edge(label="JWT token") >> appsync
    appsync >> Edge(label="GraphQL resolvers\n(queries + mutations)") >> dynamodb
    react >> Edge(label="Amplify Storage\n(presigned URLs)") >> s3_storage

    # Amplify internal
    appsync >> Edge(label="codegen", style="dashed", color="#999999") >> s3_codegen
    appsync >> Edge(label="schema", style="dashed", color="#999999") >> s3_schema

print(f"Diagram generated: {OUTPUT_FILE}.png")
