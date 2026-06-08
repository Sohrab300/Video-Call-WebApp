**Video Call App**

A modern video call platform that connects like-minded individuals based on their interests. Users submit their interests, which are transformed into vector embeddings using state-of-the-art machine learning models. The backend computes cosine similarity between embeddings to automatically match users with similar passions.

🚀 Features:

- Real-Time Matching: Automatically pairs users based on the semantic similarity of their interests.
  
- Scalable Architecture: Frontend hosted on GitHub Pages, backend deployed on Render, with a PostgreSQL database for reliable data storage.

- Machine Learning Integration: Leverages vector embeddings to capture nuanced user interests, enabling accurate and dynamic matchmaking.
  
- Seamless Communication: Facilitates real-time video calls through efficient signaling and connection management.
  

🛠 Tech Stack:

- Node.js
- React
- Express
- Socket.IO
- PostgreSQL
- FastAPI
- Uvicorn
- advanced text embedding models.

🔗 Live Demo: https://sohrab300.github.io/Video-Call-WebApp/

## Production WebSocket timeout

The backend uses Socket.IO/WebSockets for call signaling. If the backend is
deployed on Cloud Run, set the service request timeout higher than the longest
call you want to support. Cloud Run's default timeout is 5 minutes, and a
WebSocket is still counted as a long-running HTTP request. Leaving the default
will disconnect active calls after roughly 300 seconds.

Recommended Cloud Run setting:

```bash
gcloud run services update SERVICE_NAME --region REGION --timeout 3600
```

For new deployments:

```bash
gcloud run deploy SERVICE_NAME --image IMAGE_URL --region REGION --timeout 3600
```

The app also enables Socket.IO connection state recovery and waits briefly
before treating a signaling disconnect as a user leaving. That protects short
network drops, but it does not replace the Cloud Run timeout setting.
