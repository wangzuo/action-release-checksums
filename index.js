const core = require("@actions/core");
const github = require("@actions/github");
const crypto = require("crypto");

async function run() {
  const token = core.getInput("repo-token");
  const octokit = github.getOctokit(token);

  let release = null;
  let tag = github.context.ref.replace(/^refs\/tags\//, "");
  const { owner, repo } = github.context.repo;

  try {
    release = await octokit.rest.repos.getReleaseByTag({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      tag: tag,
    });
  } catch (err) {
    if (err.status === 404) {
      let newRelease = {
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        tag_name: tag,
      };
      release = await octokit.rest.repos.createRelease(newRelease);
    }
  }

  const release_id = release.data.id;

  const assets = await octokit.rest.repos.listReleaseAssets({
    owner,
    repo,
    release_id,
  });

  const hashes = await Promise.all(
    assets.data
      .filter((d) => d.name !== "checksums.txt")
      .map(async (asset) => {
        const file = await octokit.rest.repos.getReleaseAsset({
          owner,
          repo,
          asset_id: asset.id,
          headers: { accept: "application/octet-stream" },
        });
        const hash = crypto
          .createHash("sha256")
          .update(Buffer.from(file.data))
          .digest("hex");
        return `${hash}  ${asset.name}`;
      })
  );

  const data = hashes.join("\n");

  try {
    await octokit.rest.repos.uploadReleaseAsset({
      owner,
      repo,
      release_id,
      name: "checksums.txt",
      data: data,
    });
  } catch (err) {
    const assets = await octokit.rest.repos.listReleaseAssets({
      owner,
      repo,
      release_id,
    });
    const asset = assets.data.filter((a) => a.name === "checksums.txt")[0];
    await octokit.rest.repos.deleteReleaseAsset({
      owner,
      repo,
      asset_id: asset.id,
    });
    await octokit.rest.repos.uploadReleaseAsset({
      owner,
      repo,
      release_id,
      name: "checksums.txt",
      data: data,
    });
  }
}

run();
