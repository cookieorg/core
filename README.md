# core

This repository hosts the core functionality of Cookie automation

The production versions are published outside of the core repository for security reasons and due to frequent changes in the API, which is closed-source. Because of this, we adopted a core model, where this repository contains only the shared and stable functionality. This approach allows us to keep sensitive logic and API-dependent changes isolated, while ensuring that updates to the bot can be made without directly impacting the core or production cookies.