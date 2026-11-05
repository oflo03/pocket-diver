"""Build metadata and a browser preview; PNG image bytes are never modified."""
from pathlib import Path
from PIL import Image
import csv, hashlib, json, zipfile
ROOT=Path(__file__).resolve().parent
status=json.loads((ROOT/"generation-status-final.json").read_text(encoding="utf-8-sig"))
def metadata(path):
    with Image.open(path) as im:
        im.load()
        m={"width":im.width,"height":im.height,"mode":im.mode,"sha256":hashlib.sha256(path.read_bytes()).hexdigest()}
        if "A" in im.getbands():
            alpha=im.getchannel("A")
            bounds=alpha.point(lambda v:255 if v>=96 else 0).getbbox()
            m.update(alphaRange=list(alpha.getextrema()),bbox=list(bounds) if bounds else None,transparentPixelCount=alpha.histogram()[0])
        else:m.update(alphaRange=None,bbox=[0,0,im.width,im.height])
        return m
bg=metadata(ROOT/"background-giovanni.png")
W,H=bg["width"],bg["height"]
assets,warnings=[],[]
for item in status["completed"]:
    m=metadata(ROOT/item["file"])
    assert m["alphaRange"]==[0,item.get("acceptedAlphaMax",255)],(item["id"],"Expected transparent alpha")
    assert m["bbox"],(item["id"],"Empty image")
    assert hashlib.sha256(Path(item["source"]).read_bytes()).hexdigest()==m["sha256"],"PNG modified"
    l,t,r,b=m["bbox"];bw,bh=r-l,b-t
    if item["kind"]=="player":
        anchor=[W*.162,H*.938]
        fw,fh=W*.313,min(H*.855,{1:610,2:735,3:800}[item["stage"]]*H/941)
    else:anchor=[W*.53,H*.722];fw,fh=W*.416,H*.445
    override=status.get("placementOverrides",{}).get(item["id"])
    if override:
        anchor=[W*override["anchor"][0],H*override["anchor"][1]]
        fw,fh=W*override["maxSize"][0],H*override["maxSize"][1]
    scale=min(fw/bw,fh/bh)*status.get("scaleMultipliers",{}).get(item["id"],1)
    a={k:item[k] for k in ["id","nameKo","kind","file","promptFile"]}
    if item["kind"]=="player":a.update(stage=item["stage"],index=item["index"])
    a.update(meta=m,placement={"left":anchor[0]-bw*scale/2,"top":anchor[1]-bh*scale,
        "width":bw*scale,"height":bh*scale,"anchor":anchor,"scale":scale,"flipX":item["id"] in status["flipX"]})
    assets.append(a)
    if l==0 or t==0 or r==m["width"] or b==m["height"]:
        warnings.append({"id":item["id"],"type":"silhouette_near_canvas_edge","note":"Inspect appendage tips before animation or stricter production use."})
manifest={"version":1,"status":"partial","generator":"built-in image_gen","canvas":{"width":W,"height":H},
    "fixed":{"file":"background-giovanni.png","meta":bg},"drawOrder":["fixed","boss","player"],"bboxAlphaThreshold":96,
    "assets":assets,"missing":[{k:a[k] for k in ["id","nameKo","kind"]} for a in status["missing"]],"warnings":warnings}
(ROOT/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding="utf-8")
with (ROOT/"failure-requests.csv").open("w",encoding="utf-8-sig",newline="") as f:
    writer=csv.writer(f);writer.writerow(["pokemon","request_id","stage","category","result"])
    for e in status["errors"]:
        if e["phase"]=="image_generation":writer.writerow([e["id"],e["requestId"],"output","other","moderation_blocked"])
players=sum(a["kind"]=="player" for a in assets);bosses=sum(a["kind"]=="boss" for a in assets)
missing=" / ".join(a["nameKo"] for a in status["missing"])
readme=f"""# 보스 헌상 장면 교체용 에셋 — 제작 진행본

{status.get("updatedAt","2026-10-06")}. 내장 image_gen으로 제작했습니다.

- 고정 배경 + 비주기: 1장
- 플레이어: {players}/27종
- 보스: {bosses}/3묶음
- 미완성: {missing}

이 에셋 세트의 누적 이미지 요청은 {status["imageCallCount"]}회였습니다. 생성 성공 {status.get("successfulImageCalls",len(assets)+1)}회(수정본 포함), 출력 단계 moderation_blocked {sum(e["phase"]=="image_generation" for e in status["errors"])}회입니다.
결과를 확인하지 못한 이전 요청은 {status.get("imageCallsWithUnknownOutcome",0)}회이며, 생성 실패 횟수에 포함하지 않았습니다.
오류 응답은 output / other만 알려 주므로 원인이나 오탐 여부는 확인되지 않았습니다.
미완성 종의 이미지는 패키지에 없으며 다른 이미지로 대체하지 않았습니다.

## 사용
preview.html을 브라우저에서 열면 플레이어와 보스를 선택해 조합할 수 있습니다.
배경과 비주기는 background-giovanni.png 한 장에 고정되어 있습니다.
첫 보스는 마나피 1마리 + 피오네 3마리 + 포획망을 묶은 투명 PNG입니다.

PNG 원본은 리사이즈, 크롭, 색 보정 없이 보존했습니다.
manifest.json에 원본 크기, 불투명 영역 경계, 합성 위치, 배율, 방향이 있습니다.
배치는 원본 픽셀을 읽어 얻은 경계와 승인한 구도를 기준으로 정했습니다.
고정 장면 → 보스 → 플레이어 순으로 그립니다.
원본이 왼쪽을 보는 캐릭터는 manifest의 flipX 배치 정보에 따라 표시할 때만 좌우 반전합니다.
서로 다른 체형을 같은 전경 영역에 맞춘 연출용 크기이며 도감 신장 비율은 아닙니다.
외곽에 붙은 부위가 있는 파일은 manifest의 warnings에 적었습니다.
애니메이션 시트나 정확한 저해상도 픽셀 격자로 정리한 결과물은 아닙니다.

## 기록
- prompts/: 실제 사용한 성공 프롬프트와 미완성 종의 마지막 실패 프롬프트
- generation-status-final.json: 최종 상태, 원본 경로, 실패 응답
- failure-requests.csv: 이번 작업의 실제 이미지 실패 요청 ID
- manifest.json: 배치 정보와 파일 해시
- gaze-review.html: 보스 방향으로 시선을 수정한 6종 비교

## 최근 반영
울머기, 꼬부기, 개굴닌자, 늪짱이, 거북왕을 추가했습니다. 기운 없는 루기아 수정본은 사용자가 승인한 원본 그대로 반영했으며, 기존 단상 위에 크게 배치했습니다.
루기아 주변의 미세한 번짐과 최대 알파 254는 생성 원본에 포함된 상태로 보존했습니다.
로컬 미리보기 접근이 브라우저 보안 정책으로 차단되어 이번 수정의 합성 화면은 직접 확인하지 못했습니다.

이미지 생성과 별도로 긴 진행 로그 저장 중 명령 길이 제한 오류가 1회 있었습니다.
아꾸왁 PNG와 프롬프트는 그 전에 저장됐고 실제 파일을 확인했습니다.
해당 저장 오류는 이미지 생성 실패 횟수에 포함하지 않았습니다.
"""
(ROOT/"README.md").write_text(readme,encoding="utf-8")
html=(ROOT/"preview-template.html").read_text(encoding="utf-8")
(ROOT/"preview.html").write_text(html.replace("__MANIFEST__",json.dumps(manifest,ensure_ascii=False)),encoding="utf-8")
zip_path=ROOT.parent/status.get("archiveName","boss-tribute-modular-v1-partial.zip")
members=["background-giovanni.png","manifest.json","preview.html","README.md","generation-status-final.json","failure-requests.csv"]
members += [a["file"] for a in assets]
proof=status.get("previewProof","preview-proof.jpg")
if (ROOT/proof).exists():members.append(proof)
gaze_proof=status.get("gazeReview",{}).get("proof")
if gaze_proof and (ROOT/gaze_proof).exists():members.append(gaze_proof)
if (ROOT/"gaze-review.html").exists():members.append("gaze-review.html")
members += [p.relative_to(ROOT).as_posix() for p in sorted((ROOT/"prompts").rglob("*.txt"))]
with zipfile.ZipFile(zip_path,"w",zipfile.ZIP_DEFLATED) as z:
    for member in members:z.write(ROOT/member,member)
with zipfile.ZipFile(zip_path) as z:
    assert z.testzip() is None
    assert sum(n.endswith(".png") for n in z.namelist())==1+len(assets)
print(json.dumps({"pngs":len(assets)+1,"players":players,"bosses":bosses,"missing":len(status["missing"]),
"zip":str(zip_path),"zipBytes":zip_path.stat().st_size,"edgeWarnings":warnings,"alphaValidated":len(assets)},ensure_ascii=False,indent=2))
