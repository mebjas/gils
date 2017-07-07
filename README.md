# gils

<i>**NOTE: This project is me exploring machine learning concepts in ad-hoc manner, haven't done any course on ML yet.
So I have a goal in hand and I'm doing stuff one by one, in my free time. EXPECT lot of random useless stuff in this project.**</i>

Github (Issue title, issue text, labels) spider: Spider bot to scrape issue to labels dataset from Github. This dataset will help build a auto labeling model.

AIM: spider auto scales by adding new access tokens to system. This is done by adding a new token to `token-store` service.

### How to run
```sh
# token-store service for service discovery
node token-store/index.js
```

```sh
# boss service for task allocation and spawning workers
node boss/index.js
```

### API Flow diagram
![gils API flow](http://blog.minhazav.xyz/wp-content/uploads/2016/08/gils-flow.png)
