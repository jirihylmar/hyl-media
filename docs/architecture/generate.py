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
from diagrams.aws.compute import Lambda
from diagrams.aws.database import Dynamodb
from diagrams.aws.integration import Appsync
from diagrams.aws.network import CloudFront
from diagrams.aws.security import Cognito, SecretsManager
from diagrams.aws.storage import S3
from diagrams.onprem.client import User, Client
from diagrams.programming.framework import React
from diagrams.programming.language import Python

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

node_attr = {"fontsize": "9"}
edge_attr = {"fontsize": "8", "color": "#444444"}

with Diagram(
    "HYL Media — Architecture (Dublin Core metadata-repository)\n"
    "Amplify App: d2r70lavusnzlx | Account: 299025166536 | eu-central-1",
    filename=str(OUTPUT_FILE),
    show=False,
    direction="TB",
    graph_attr=graph_attr,
    node_attr=node_attr,
    edge_attr=edge_attr,
):
    user = User("Browser\njiri.hylmar@gmail.com")

    with Cluster("Amplify Hosting\nhttps://main.d2r70lavusnzlx.amplifyapp.com"):
        cloudfront = CloudFront("CloudFront\nSPA + rewrite rules")
        react = React(
            "React + TypeScript (Vite)\n\nDossier hub at /\n6 DC detail pages\n"
            "'metadata' link → raw sidecar\nsearch + tags"
        )

    with Cluster("Amplify Gen 2 Backend (AppSync)"):
        cognito = Cognito("Cognito User Pool\neu-central-1_GJhwO2ww5")
        appsync = Appsync(
            "AppSync GraphQL\n\nDC custom resolvers:\n"
            "getMetadata / listMetadataByType\nsearchMetadata / getMetadataByLegacyId\n"
            "updateMetadata (SET, pin)\n+ legacy CRUD (create path)"
        )
        meta_lambda = Lambda("metadata-api Lambda\nDC read/write over the\nmetadata-repository table")

    with Cluster("DynamoDB"):
        dc_table = Dynamodb(
            "hyl-media-metadata-repository\n\n1194 DC records (PK=id)\n"
            "conformant sidecar shape\n28 canonical Attributes + ext\ndc_abstract enriched"
        )
        legacy_table = Dynamodb(
            "KnowledgeGraphItem-*\n(legacy, still live)\n\nrelationship cross-refs\n+ create path"
        )

    with Cluster("S3 — hylmediastoragebucketefb-* (Amplify-managed)"):
        s3_content = S3("Content\ndatasets/ (movie,recording)\nagents/ (person,band)\ndocuments/ (book,sheet)")
        s3_sidecars = S3("DC sidecars\nmetadata/<cat>/<uuid>/\n*.metadata.json")
        s3_legacy = S3("Legacy originals\nlibrary/ · sheet-music/")

    with Cluster("DC lifecycle — managed-resource skill (operator / offline)"):
        enrich = Python("enrich-dc.mjs\npublic/private + pdfinfo\nClaude enrichment")
        reconcile = Python("sync-dc-to-s3.mjs\nDDB → sidecars")
        audit = Python("audit-dc-conformance.mjs\nfull structural rules")
        dh_cli = Python("DH Python CLI\nupdate-metadata\nsidecars → DDB")
        secret = SecretsManager("Secrets Manager\nhyl-media/anthropic-api-key")
        claude = Client("Claude API\n(claude-opus-4-8)")

    # Runtime request flow
    user >> Edge(label="HTTPS") >> cloudfront >> Edge(label="serves") >> react
    react >> Edge(label="Amplify Auth") >> cognito >> Edge(label="JWT") >> appsync
    appsync >> Edge(label="DC queries/mutations") >> meta_lambda >> dc_table
    appsync >> Edge(label="cross-refs / create", style="dashed", color="#999999") >> legacy_table
    react >> Edge(label="Storage getUrl\n(PDF + sidecar JSON)") >> s3_content
    react >> Edge(label="metadata link") >> s3_sidecars

    # DC lifecycle flow
    enrich >> Edge(label="GetSecretValue", color="#a3334d") >> secret
    enrich >> Edge(label="messages.create", color="#a3334d") >> claude
    enrich >> Edge(label="UpdateItem") >> dc_table
    reconcile >> Edge(label="GET/PUT") >> s3_sidecars
    dc_table >> Edge(label="read", style="dashed", color="#999999") >> reconcile
    dh_cli >> Edge(label="scan + upsert", style="dashed", color="#999999") >> dc_table
    s3_sidecars >> Edge(label="scan", style="dashed", color="#999999") >> dh_cli
    audit >> Edge(label="GET + verify", style="dashed", color="#999999") >> s3_sidecars

print(f"Diagram generated: {OUTPUT_FILE}.png")
