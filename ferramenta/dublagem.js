/* =========================================================
   GAMEDUB — MOTOR DA FERRAMENTA DE DUBLAGEM
   ========================================================= */


/* =========================================================
   CONFIGURAÇÃO DA CENA
   ========================================================= */

const parametros =
    new URLSearchParams(
        window.location.search
    );

const pastaCena =
    parametros.get("cena") ||
    "re4-ashley";

const paginaVoltar =
    parametros.get("voltar") ||
    "index.html";

const caminhoBase =
    "videos/" +
    pastaCena +
    "/";


/* =========================================================
   CONFIGURAR BOTÃO VOLTAR
   ========================================================= */

const linkVoltar =
    document.getElementById("linkVoltar");

if (linkVoltar) {
    linkVoltar.href = paginaVoltar;
}


/* =========================================================
   ELEMENTOS DA INTERFACE
   ========================================================= */

const video =
    document.getElementById("video");

const canvas =
    document.getElementById("canvasWave");

const canvasDub =
    document.getElementById("canvasDub");

const ctx =
    canvas.getContext("2d");

const ctxDub =
    canvasDub.getContext("2d");

const listaFalas =
    document.getElementById("listaFalas");

const textoAtual =
    document.getElementById("textoAtual");

const statusEl =
    document.getElementById("status");

const btnGravar =
    document.getElementById("btnGravar");

const btnOuvir =
    document.getElementById("btnOuvir");

const btnRegravar =
    document.getElementById("btnRegravar");

const btnAnterior =
    document.getElementById("btnAnterior");

const btnProxima =
    document.getElementById("btnProxima");

const btnBaixar =
    document.getElementById("btnBaixar");

const playhead =
    document.getElementById("playhead");

const tituloCena =
    document.getElementById("tituloCena");


/* =========================================================
   VARIÁVEIS DO MOTOR
   ========================================================= */

let dados = null;
let falaAtual = 0;

let gravador = null;
let chunks = [];

let gravando = false;
let ouvindo = false;

let audioPlayer = null;

let urlsDublagem = [];
let waveformsDublagem = [];

/*
   Aqui podem existir:
   - Blob, quando gravado nesta sessão
   - true, quando carregado do Supabase
   - null, quando não existe gravação
*/
let gravacoes = [];

let ffmpeg = null;
let ffmpegCarregado = false;

/* =========================================================
   SISTEMA DE PAGAMENTO E VERIFICAÇÃO AUTOMÁTICA
   ========================================================= */

let intervaloPagamentoGameDub = null;

async function iniciarPagamentoGameDub() {
    try {
        const supabase = obterClienteSupabase();
        if (!supabase) {
            alert("Erro ao conectar com o serviço.");
            return;
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            alert("Você precisa estar logado para realizar o pagamento.");
            return;
        }

        const resposta = await fetch(
            "https://tpiwuqjrywzbwudigoro.supabase.co/functions/v1/criar-pagamento",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${session.access_token}`
                }
            }
        );

        const dadosPagamento = await resposta.json();

        if (dadosPagamento.error) {
            alert("Erro ao gerar pagamento: " + dadosPagamento.error);
            return;
        }

        mostrarPixPagamento(dadosPagamento);
        iniciarVerificacaoPagamentoGameDub();

    } catch (erro) {
        console.error("Erro ao iniciar pagamento:", erro);
        alert("Erro ao processar pagamento.");
    }
}

function mostrarPixPagamento(dadosPagamento) {
    const modalConteudo = document.querySelector(".gamedub-pagamento-modal");
    if (!modalConteudo) return;

    modalConteudo.innerHTML = `
        <button class="gamedub-pagamento-fechar" id="fecharModalPagamento" aria-label="Voltar para o início">×</button>
        <div class="gamedub-pagamento-icone">⚡</div>
        <h2>Pagamento via Pix</h2>
        <p class="gamedub-pagamento-destaque">Escaneie o QR Code abaixo ou copie a chave Pix:</p>
        
        <div style="margin: 20px 0; text-align: center;">
            <img src="data:image/png;base64,${dadosPagamento.qr_code_base64}" alt="QR Code Pix" style="max-width: 200px; width: 100%; border-radius: 10px;" />
        </div>

        <div style="margin-bottom: 20px;">
            <input type="text" id="pixCopiaCola" value="${dadosPagamento.qr_code}" readonly style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #333; background: #222; color: #fff; margin-bottom: 10px; font-size: 12px; text-align: center;" />
            <button id="btnCopiarPix" class="gamedub-pagamento-botao" style="padding: 10px;">Copiar Pix Copia e Cola</button>
        </div>

        <p class="gamedub-pagamento-texto" style="font-size: 13px; color: #aaa;">
            Aguardando confirmação do pagamento...
        </p>
    `;

    const btnFechar = document.getElementById("fecharModalPagamento");
    if (btnFechar) {
        btnFechar.addEventListener("click", function() {
            window.location.href = "index.html";
        });
    }

    const btnCopiar = document.getElementById("btnCopiarPix");
    if (btnCopiar) {
        btnCopiar.addEventListener("click", function() {
            const inputPix = document.getElementById("pixCopiaCola");
            if (inputPix) {
                inputPix.select();
                navigator.clipboard.writeText(inputPix.value);
                btnCopiar.textContent = "Copiado!";
                setTimeout(() => {
                    btnCopiar.textContent = "Copiar Pix Copia e Cola";
                }, 2000);
            }
        });
    }
}

function iniciarVerificacaoPagamentoGameDub() {
    if (intervaloPagamentoGameDub) {
        clearInterval(intervaloPagamentoGameDub);
    }
    intervaloPagamentoGameDub = setInterval(verificarPagamentoGameDub, 3000);
}

async function verificarPagamentoGameDub() {
    const supabase = obterClienteSupabase();
    if (!supabase || !usuarioSupabase) return;

    const { data: acesso, error } = await supabase
        .from("acessos")
        .select("pagamento_confirmado")
        .eq("usuario_id", usuarioSupabase.id)
        .maybeSingle();

    if (error) {
        console.error("Erro ao verificar pagamento:", error);
        return;
    }

    if (acesso && acesso.pagamento_confirmado === true) {
        if (intervaloPagamentoGameDub) {
            clearInterval(intervaloPagamentoGameDub);
        }
        window.location.reload();
    }
}

/* =========================================================
   MODAL DE ACESSO / PAGAMENTO
   ========================================================= */
function mostrarModalPagamento() {

    // Evita criar dois modais ao mesmo tempo
    const modalExistente =
        document.getElementById(
            "modalPagamentoGameDub"
        );

    if (modalExistente) {
        return;
    }


    const overlay =
        document.createElement("div");

    overlay.id =
        "modalPagamentoGameDub";


    overlay.innerHTML = `

        <div class="gamedub-pagamento-overlay">

            <div class="gamedub-pagamento-modal">

                <button
                    class="gamedub-pagamento-fechar"
                    id="fecharModalPagamento"
                    aria-label="Voltar para o início"
                >
                    ×
                </button>


                <div class="gamedub-pagamento-icone">
                    ✨
                </div>


                <div class="gamedub-pagamento-badge">
                    ACESSO VITALÍCIO
                </div>


                <h2>
                    Libere o GameDub completo
                </h2>


                <p class="gamedub-pagamento-destaque">
                    Sua cena grátis já foi utilizada.
                </p>


                <p class="gamedub-pagamento-texto">

                    Desbloqueie o GameDub por
                    <strong>R$ 2,99</strong>
                    e tenha acesso a
                    <strong>todas as cenas</strong>
                    disponíveis atualmente
                    e também às novas cenas
                    adicionadas no futuro.

                </p>


                <div class="gamedub-pagamento-beneficios">

                    <div>
                        <span>✓</span>
                        Todas as cenas atuais
                    </div>

                    <div>
                        <span>✓</span>
                        Novas cenas adicionadas no futuro
                    </div>

                    <div>
                        <span>✓</span>
                        Acesso vitalício
                    </div>

                </div>


                <div class="gamedub-pagamento-aviso">

                    Pagamento único.
                    Sem mensalidade.

                </div>


                <button
                    id="btnDesbloquearGameDub"
                    class="gamedub-pagamento-botao"
                >

                    Desbloquear por R$ 2,99

                </button>

            </div>

        </div>

    `;


    const estilo =
        document.createElement("style");


    estilo.id =
        "estiloModalPagamentoGameDub";


    estilo.textContent = `

        .gamedub-pagamento-overlay {

            position: fixed;

            inset: 0;

            z-index: 999999;

            display: flex;

            align-items: center;

            justify-content: center;

            padding: 20px;

            background:
                rgba(0, 0, 0, .78);

            backdrop-filter:
                blur(8px);

            animation:
                gamedubPagamentoEntrada
                .22s ease-out;

        }


        .gamedub-pagamento-modal {

            position: relative;

            width: 100%;

            max-width: 470px;

            padding: 38px 38px 34px;

            border-radius: 20px;

            background:
                linear-gradient(
                    145deg,
                    #181818,
                    #101010
                );

            border:
                1px solid
                rgba(255, 23, 68, .28);

            box-shadow:

                0 25px 80px
                rgba(0, 0, 0, .65),

                0 0 45px
                rgba(255, 23, 68, .08);

            color: white;

            text-align: center;

            overflow: hidden;

        }


        .gamedub-pagamento-modal::before {

            content: "";

            position: absolute;

            top: 0;

            left: 0;

            right: 0;

            height: 3px;

            background:
                linear-gradient(
                    90deg,
                    transparent,
                    #ff1744,
                    transparent
                );

        }


        .gamedub-pagamento-fechar {

            position: absolute;

            top: 14px;

            right: 14px;

            width: 34px;

            height: 34px;

            border: none;

            border-radius: 50%;

            background:
                rgba(255,255,255,.07);

            color: #aaa;

            font-size: 23px;

            line-height: 1;

            cursor: pointer;

            transition:
                .2s ease;

        }


        .gamedub-pagamento-fechar:hover {

            background:
                rgba(255,23,68,.18);

            color: white;

            transform:
                rotate(90deg);

        }


        .gamedub-pagamento-icone {

            width: 68px;

            height: 68px;

            margin:
                0 auto 16px;

            display: flex;

            align-items: center;

            justify-content: center;

            border-radius: 50%;

            background:
                rgba(255,23,68,.12);

            border:
                1px solid
                rgba(255,23,68,.25);

            color: #ff1744;

            font-size: 31px;

            box-shadow:
                0 0 30px
                rgba(255,23,68,.10);

        }


        .gamedub-pagamento-badge {

            display: inline-block;

            margin-bottom: 12px;

            padding:
                5px 11px;

            border-radius: 999px;

            background:
                rgba(255,23,68,.10);

            border:
                1px solid
                rgba(255,23,68,.22);

            color: #ff1744;

            font-size: 11px;

            font-weight: 800;

            letter-spacing: 1px;

        }


        .gamedub-pagamento-modal h2 {

            margin:
                0 0 10px;

            font-size: 26px;

            line-height: 1.2;

            font-weight: 800;

            color: white;

        }


        .gamedub-pagamento-destaque {

            margin:
                0 0 14px;

            color: #ddd;

            font-size: 15px;

        }


        .gamedub-pagamento-texto {

            max-width: 390px;

            margin:
                0 auto 22px;

            color: #aaa;

            font-size: 14px;

            line-height: 1.65;

        }


        .gamedub-pagamento-texto strong {

            color: white;

        }


        .gamedub-pagamento-beneficios {

            display: flex;

            flex-direction: column;

            gap: 10px;

            margin:
                0 auto 20px;

            padding:
                16px 18px;

            border-radius: 13px;

            background:
                rgba(255,255,255,.035);

            border:
                1px solid
                rgba(255,255,255,.06);

            text-align: left;

        }


        .gamedub-pagamento-beneficios div {

            display: flex;

            align-items: center;

            gap: 10px;

            color: #ddd;

            font-size: 13px;

        }


        .gamedub-pagamento-beneficios span {

            display: flex;

            align-items: center;

            justify-content: center;

            flex-shrink: 0;

            width: 20px;

            height: 20px;

            border-radius: 50%;

            background:
                rgba(255,23,68,.14);

            color: #ff1744;

            font-weight: 900;

            font-size: 12px;

        }


        .gamedub-pagamento-aviso {

            margin-bottom: 18px;

            color: #777;

            font-size: 12px;

        }


        .gamedub-pagamento-botao {

            width: 100%;

            padding:
                15px 20px;

            border: none;

            border-radius: 11px;

            background:
                linear-gradient(
                    135deg,
                    #ff1744,
                    #d50035
                );

            color: white;

            font-size: 15px;

            font-weight: 800;

            cursor: pointer;

            box-shadow:
                0 8px 25px
                rgba(255,23,68,.20);

            transition:
                .2s ease;

        }


        .gamedub-pagamento-botao:hover {

            transform:
                translateY(-2px);

            box-shadow:
                0 12px 30px
                rgba(255,23,68,.32);

            filter:
                brightness(1.08);

        }


        .gamedub-pagamento-botao:active {

            transform:
                translateY(0);

        }


        @keyframes gamedubPagamentoEntrada {

            from {

                opacity: 0;

            }

            to {

                opacity: 1;

            }

        }


        @media (max-width: 520px) {

            .gamedub-pagamento-modal {

                padding:
                    32px 22px 26px;

                border-radius: 17px;

            }


            .gamedub-pagamento-modal h2 {

                font-size: 22px;

            }

        }

    `;


    document.head.appendChild(
        estilo
    );


    document.body.appendChild(
        overlay
    );


    /*
       X:
       NÃO libera a cena.
       NÃO fecha para continuar nela.
       Apenas volta para a primeira tela do GameDub.
    */

    const btnFechar =
        document.getElementById(
            "fecharModalPagamento"
        );


    btnFechar.addEventListener(
        "click",
        function() {

            window.location.href =
                "index.html";

        }
    );


    /*
       BOTÃO DE PAGAMENTO
    */

    const btnPagamento =
        document.getElementById(
            "btnDesbloquearGameDub"
        );if (btnPagamento) {
        btnPagamento.addEventListener(
            "click",
            iniciarPagamentoGameDub
        );
    }

}


/* =========================================================
   SUPABASE
   ========================================================= */

const SUPABASE_URL_DUBLAGEM =
    "https://tpiwuqjrywzbwudigoro.supabase.co";

const SUPABASE_KEY_DUBLAGEM =
    "sb_publishable_wRa63XvdJ6PWYpx_8lRDsw_zJuTvNas";

let supabaseDublagem = null;
let usuarioSupabase = null;
let dublagemSupabaseId = null;
let acessoUsuario = null;


/* =========================================================
   CLIENTE SUPABASE
   ========================================================= */

function obterClienteSupabase() {

    if (supabaseDublagem) {
        return supabaseDublagem;
    }

    if (
        !window.supabase ||
        !window.supabase.createClient
    ) {
        console.error(
            "Supabase não foi carregado."
        );

        return null;
    }

    supabaseDublagem =
        window.supabase.createClient(
            SUPABASE_URL_DUBLAGEM,
            SUPABASE_KEY_DUBLAGEM
        );

    return supabaseDublagem;
}


/* =========================================================
   PREPARAR SUPABASE DA CENA
   ========================================================= */

async function prepararSupabaseDaCena() {

    const supabase =
        obterClienteSupabase();

    if (!supabase) {
        return;
    }

    const {
        data: {
            session
        }
    } = await supabase.auth.getSession();

    if (!session) {

        console.warn(
            "Usuário não está logado."
        );

        usuarioSupabase = null;
        dublagemSupabaseId = null;
        acessoUsuario = null;

        return;
    }

    usuarioSupabase =
        session.user;


    /* =====================================================
       VERIFICAR ACESSO DO USUÁRIO
       ===================================================== */

    const {
        data: acessoExistente,
        error: erroAcesso
    } = await supabase
        .from("acessos")
        .select(
            "usuario_id, cena_gratis_usada, pagamento_confirmado, cena_gratis_id"
        )
        .eq(
            "usuario_id",
            usuarioSupabase.id
        )
        .maybeSingle();


    if (erroAcesso) {

        console.error(
            "Erro ao verificar acesso:",
            erroAcesso
        );

        return;
    }


    acessoUsuario =
        acessoExistente;


    /* =====================================================
       USUÁRIO JÁ PAGOU
       ===================================================== */

    if (
        acessoUsuario &&
        acessoUsuario.pagamento_confirmado === true
    ) {

        console.log(
            "Usuário possui acesso completo."
        );

    }


    /* =====================================================
       USUÁRIO JÁ USOU A CENA GRÁTIS
       ===================================================== */

    else if (
        acessoUsuario &&
        acessoUsuario.cena_gratis_usada === true
    ) {

        const cenaGratis =
            acessoUsuario.cena_gratis_id;


        /*
           Se a cena atual não for a mesma cena
           escolhida anteriormente, bloquear.
        */

        if (
            cenaGratis &&
            cenaGratis !== pastaCena
        ) {

            console.warn(
                "Usuário já utilizou sua cena grátis."
            );

            mostrarModalPagamento();return false;

            dublagemSupabaseId = null;

            return;
        }


        console.log(
            "Acesso à cena grátis permitido."
        );

    }


    /* =====================================================
       USUÁRIO AINDA NÃO USOU O GRATUITO
       ===================================================== */

    else {

        console.log(
            "Usuário ainda possui uma cena grátis disponível."
        );

    }


    /* =====================================================
       PROCURAR DUBLAGEM DA CENA
       ===================================================== */

    const {
        data: dublagemExistente,
        error: erroBusca
    } = await supabase
        .from("dublagens")
        .select("*")
        .eq(
            "usuario_id",
            usuarioSupabase.id
        )
        .eq(
            "cena_id",
            pastaCena
        )
        .order(
            "atualizada_em",
            {
                ascending: false
            }
        )
        .limit(1)
        .maybeSingle();


    if (erroBusca) {

        console.error(
            "Erro ao procurar dublagem:",
            erroBusca
        );

        return;
    }


    /* =====================================================
       CRIAR DUBLAGEM SE NÃO EXISTIR
       ===================================================== */

    if (!dublagemExistente) {

        const {
            data: novaDublagem,
            error: erroCriacao
        } = await supabase
            .from("dublagens")
            .insert({
                usuario_id:
                    usuarioSupabase.id,

                cena_id:
                    pastaCena,

                progresso:
                    0,

                concluida:
                    false
            })
            .select()
            .single();


        if (erroCriacao) {

            console.error(
                "Erro ao criar dublagem:",
                erroCriacao
            );

            return;
        }


        dublagemSupabaseId =
            novaDublagem.id;

    } else {

        dublagemSupabaseId =
            dublagemExistente.id;
    }


    await carregarGravacoesSupabase();
}


/* =========================================================
   CARREGAR GRAVAÇÕES DO SUPABASE
   ========================================================= */

async function carregarGravacoesSupabase() {

    const supabase =
        obterClienteSupabase();

    if (
        !supabase ||
        !usuarioSupabase ||
        !dublagemSupabaseId ||
        !dados ||
        !Array.isArray(dados.falas)
    ) {
        return;
    }

    const {
        data: registros,
        error
    } = await supabase
        .from("gravacoes")
        .select("*")
        .eq(
            "dublagem_id",
            dublagemSupabaseId
        );

    if (error) {

        console.error(
            "Erro ao carregar gravações:",
            error
        );

        return;
    }

    gravacoes =
        new Array(
            dados.falas.length
        ).fill(null);

    urlsDublagem =
        new Array(
            dados.falas.length
        ).fill(null);

    waveformsDublagem =
        new Array(
            dados.falas.length
        ).fill(null);

    for (
        const registro of registros || []
    ) {

        if (!registro.arquivo) {
            continue;
        }

        const indice =
            Number(
                registro.fala_id
            );

        if (
            Number.isNaN(indice) ||
            indice < 0 ||
            indice >= gravacoes.length
        ) {
            continue;
        }

        const {
            data: urlData,
            error: erroUrl
        } = await supabase
            .storage
            .from("dublagens")
            .createSignedUrl(
                registro.arquivo,
                60 * 60
            );

        if (erroUrl) {

            console.error(
                "Erro ao gerar URL da gravação:",
                erroUrl
            );

            continue;
        }

        urlsDublagem[indice] =
            urlData.signedUrl;

        /*
           TRUE significa:
           existe uma gravação no Supabase,
           mas o Blob ainda não está na memória.
        */
        gravacoes[indice] = true;

        if (Array.isArray(registro.waveform)) {

            waveformsDublagem[indice] =
                registro.waveform;

        } else {

            waveformsDublagem[indice] =
                null;
        }
    }

    if (
        typeof montarListaFalas ===
        "function"
    ) {
        montarListaFalas();
    }

    if (
        typeof atualizarInterface ===
        "function"
    ) {
        atualizarInterface();
    }

    if (
        typeof verificarTodasGravadas ===
        "function"
    ) {
        verificarTodasGravadas();
    }

    desenharWaveformDublagem();
}


/* =========================================================
   SALVAR GRAVAÇÃO NO SUPABASE
   ========================================================= */

async function salvarGravacaoSupabase(
    index,
    blob
) {

    const supabase =
        obterClienteSupabase();

    if (!supabase) {
        return;
    }

    if (
        !usuarioSupabase ||
        !dublagemSupabaseId
    ) {

        await prepararSupabaseDaCena();
    }

    if (
        !usuarioSupabase ||
        !dublagemSupabaseId
    ) {

        console.warn(
            "Não foi possível salvar: usuário não autenticado."
        );

        return;
    }

    const caminho =
        `${usuarioSupabase.id}/${pastaCena}/fala-${index + 1}.webm`;

    await supabase
        .storage
        .from("dublagens")
        .remove([
            caminho
        ]);

    const {
        error: erroUpload
    } = await supabase
        .storage
        .from("dublagens")
        .upload(
            caminho,
            blob,
            {
                contentType:
                    "audio/webm",

                upsert:
                    true
            }
        );

    if (erroUpload) {

        console.error(
            "Erro ao enviar gravação:",
            erroUpload
        );

        return;
    }

    const waveform =
        Array.isArray(
            waveformsDublagem[index]
        )
            ? waveformsDublagem[index]
            : [];

    const {
        data: registroExistente,
        error: erroBusca
    } = await supabase
        .from("gravacoes")
        .select("id")
        .eq(
            "dublagem_id",
            dublagemSupabaseId
        )
        .eq(
            "fala_id",
            String(index)
        )
        .maybeSingle();

    if (erroBusca) {

        console.error(
            "Erro ao procurar gravação:",
            erroBusca
        );

        return;
    }

    if (registroExistente) {

        const {
            error
        } = await supabase
            .from("gravacoes")
            .update({
                arquivo:
                    caminho,

                waveform:
                    waveform
            })
            .eq(
                "id",
                registroExistente.id
            );

        if (error) {

            console.error(
                "Erro ao atualizar gravação:",
                error
            );
        }

    } else {

        const {
            error
        } = await supabase
            .from("gravacoes")
            .insert({
                dublagem_id:
                    dublagemSupabaseId,

                fala_id:
                    String(index),

                arquivo:
                    caminho,

                waveform:
                    waveform
            });

        if (error) {

            console.error(
                "Erro ao criar gravação:",
                error
            );
        }
    }

    await atualizarProgressoSupabase();
}


/* =========================================================
   REMOVER GRAVAÇÃO DO SUPABASE
   ========================================================= */

async function removerGravacaoSupabase(
    index
) {

    const supabase =
        obterClienteSupabase();

    if (
        !supabase ||
        !usuarioSupabase ||
        !dublagemSupabaseId
    ) {
        return;
    }

    const caminho =
        `${usuarioSupabase.id}/${pastaCena}/fala-${index + 1}.webm`;

    const {
        error: erroStorage
    } = await supabase
        .storage
        .from("dublagens")
        .remove([
            caminho
        ]);

    if (erroStorage) {

        console.error(
            "Erro ao remover arquivo:",
            erroStorage
        );
    }

    const {
        error
    } = await supabase
        .from("gravacoes")
        .update({
            arquivo: "",
            waveform: null
        })
        .eq(
            "dublagem_id",
            dublagemSupabaseId
        )
        .eq(
            "fala_id",
            String(index)
        );

    if (error) {

        console.error(
            "Erro ao limpar gravação:",
            error
        );
    }

    await atualizarProgressoSupabase();
}


/* =========================================================
   ATUALIZAR PROGRESSO
   ========================================================= */

async function atualizarProgressoSupabase() {

    const supabase =
        obterClienteSupabase();

    if (
        !supabase ||
        !usuarioSupabase ||
        !dublagemSupabaseId ||
        !dados ||
        !dados.falas
    ) {
        return;
    }

    const total =
        dados.falas.length;

    const gravadas =
        gravacoes.filter(
            gravacao =>
                gravacao !== null
        ).length;

    const progresso =
        total > 0
            ? Math.round(
                (gravadas / total) * 100
            )
            : 0;

    const concluida =
        progresso >= 100;

    const {
        error
    } = await supabase
        .from("dublagens")
        .update({
            progresso,
            concluida,
            atualizada_em:
                new Date().toISOString()
        })
        .eq(
            "id",
            dublagemSupabaseId
        );

    if (error) {

        console.error(
            "Erro ao atualizar progresso:",
            error
        );
    }
}


/* =========================================================
   CARREGAR CENA
   ========================================================= */

async function carregarCena() {

    try {

        const resposta =
            await fetch(
                caminhoBase +
                "cena.json"
            );

        if (!resposta.ok) {

            throw new Error(
                "Não foi possível carregar cena.json"
            );
        }

        dados =
            await resposta.json();

        if (
            !dados ||
            !Array.isArray(dados.falas)
        ) {

            throw new Error(
                "cena.json não possui uma lista de falas válida."
            );
        }

        if (tituloCena) {
            tituloCena.textContent =
                pastaCena;
        }

        video.src =
            caminhoBase +
            (
                dados.video ||
                "video.mp4"
            );

        dados.falas.forEach(
            function(fala) {

                fala.audio_original_url =
                    null;
            }
        );

        gravacoes =
            new Array(
                dados.falas.length
            ).fill(null);

        waveformsDublagem =
            new Array(
                dados.falas.length
            ).fill(null);

        urlsDublagem =
            new Array(
                dados.falas.length
            ).fill(null);

        await prepararSupabaseDaCena();

        montarListaFalas();

        ajustarCanvas();

        selecionarFala(0);

        statusEl.textContent =
            "Pronto para gravar.";

    } catch (erro) {

        console.error(erro);

        statusEl.textContent =
            "Erro ao carregar os arquivos da cena.";
    }
}


/* =========================================================
   LISTA DE FALAS
   ========================================================= */

function montarListaFalas() {

    if (!listaFalas || !dados) {
        return;
    }

    listaFalas.innerHTML = "";

    dados.falas.forEach(
        function(fala, index) {

            const card =
                document.createElement("div");

            card.className =
                "fala-card";

            card.dataset.index =
                index;

            const temDub =
                !!gravacoes[index];

            card.innerHTML =
                `<div class="fala-numero">
                    FALA ${index + 1}
                </div>

                <div class="fala-texto">
                    ${fala.texto}
                </div>

                <div class="fala-tempo">
                    ${formatarTempo(fala.inicio_original)}
                    →
                    ${formatarTempo(fala.fim_original)}
                </div>

                ${
                    temDub
                    ?
                    '<div class="fala-gravada">✓ DUBLAGEM GRAVADA</div>'
                    :
                    '<div class="fala-original">● ÁUDIO ORIGINAL</div>'
                }`;

            card.addEventListener(
                "click",
                function() {
                    selecionarFala(index);
                }
            );

            listaFalas.appendChild(card);
        }
    );

    verificarTodasGravadas();
}


function atualizarListaFalas() {
    montarListaFalas();
}


function formatarTempo(segundos) {

    return Number.isFinite(segundos)
        ? segundos.toFixed(2) + "s"
        : "0.00s";
}


/* =========================================================
   SELECIONAR FALA
   ========================================================= */

function selecionarFala(index) {

    if (
        !dados ||
        !dados.falas[index]
    ) {
        return;
    }

    pararAudioGravacao();

    if (gravando) {
        pararGravacao();
    }

    falaAtual =
        index;

    const fala =
        dados.falas[falaAtual];

    textoAtual.textContent =
        fala.texto;

    document
        .querySelectorAll(".fala-card")
        .forEach(
            function(card) {

                card.classList.remove(
                    "ativa"
                );
            }
        );

    const cardAtivo =
        document.querySelector(
            `.fala-card[data-index="${falaAtual}"]`
        );

    if (cardAtivo) {

        cardAtivo.classList.add(
            "ativa"
        );

        cardAtivo.scrollIntoView(
            {
                behavior: "smooth",
                block: "nearest"
            }
        );
    }

    video.pause();

    video.volume = 1;

    video.currentTime =
        fala.inicio_original;

    desenharWaveformDaFala();

    desenharWaveformDublagem();

    atualizarPlayhead();

    statusEl.textContent =
        gravacoes[falaAtual]
            ?
            "Esta fala possui uma dublagem gravada."
            :
            "Esta fala usará o áudio original.";

    btnOuvir.disabled =
        false;

    btnRegravar.disabled =
        !gravacoes[falaAtual];

    atualizarBotoes();
}


/* =========================================================
   AJUSTAR CANVAS
   ========================================================= */

function ajustarCanvas() {

    const rect =
        canvas.getBoundingClientRect();

    const dpr =
        window.devicePixelRatio || 1;

    canvas.width =
        rect.width * dpr;

    canvas.height =
        rect.height * dpr;

    ctx.setTransform(
        dpr,
        0,
        0,
        dpr,
        0,
        0
    );

    const rectDub =
        canvasDub.getBoundingClientRect();

    canvasDub.width =
        rectDub.width * dpr;

    canvasDub.height =
        rectDub.height * dpr;

    ctxDub.setTransform(
        dpr,
        0,
        0,
        dpr,
        0,
        0
    );

    if (dados) {

        desenharWaveformDaFala();

        desenharWaveformDublagem();

        atualizarPlayhead();
    }
}

window.addEventListener(
    "resize",
    ajustarCanvas
);


/* =========================================================
   PROGRESSO DA FALA
   ========================================================= */

function obterProgressoDaFala() {

    if (!dados) {
        return 0;
    }

    const fala =
        dados.falas[falaAtual];

    if (!fala) {
        return 0;
    }

    const duracao =
        fala.fim_original -
        fala.inicio_original;

    if (duracao <= 0) {
        return 0;
    }

    return Math.max(
        0,
        Math.min(
            1,
            (
                video.currentTime -
                fala.inicio_original
            ) / duracao
        )
    );
}


/* =========================================================
   BARRA ARREDONDADA
   ========================================================= */

function desenharBarraArredondada(
    c,
    x,
    y,
    largura,
    altura,
    raio
) {

    const topo =
        y - altura / 2;

    const h =
        Math.max(
            2,
            altura
        );

    const r =
        Math.min(
            raio,
            largura / 2,
            h / 2
        );

    c.beginPath();

    c.moveTo(
        x + r,
        topo
    );

    c.lineTo(
        x + largura - r,
        topo
    );

    c.quadraticCurveTo(
        x + largura,
        topo,
        x + largura,
        topo + r
    );

    c.lineTo(
        x + largura,
        topo + h - r
    );

    c.quadraticCurveTo(
        x + largura,
        topo + h,
        x + largura - r,
        topo + h
    );

    c.lineTo(
        x + r,
        topo + h
    );

    c.quadraticCurveTo(
        x,
        topo + h,
        x,
        topo + h - r
    );

    c.lineTo(
        x,
        topo + r
    );

    c.quadraticCurveTo(
        x,
        topo,
        x + r,
        topo
    );

    c.closePath();

    c.fill();
}


/* =========================================================
   WAVEFORM ORIGINAL
   ========================================================= */

function obterWaveformDaFala(fala) {

    return fala &&
        Array.isArray(fala.waveform)
        ? fala.waveform
        : [];
}


function desenharWaveformDaFala() {

    if (!dados) {
        return;
    }

    const largura =
        canvas.clientWidth;

    const altura =
        canvas.clientHeight;

    ctx.clearRect(
        0,
        0,
        largura,
        altura
    );

    const fala =
        dados.falas[falaAtual];

    if (!fala) {
        return;
    }

    const waveform =
        obterWaveformDaFala(
            fala
        );

    if (!waveform.length) {

        ctx.fillStyle =
            "rgba(255,255,255,.15)";

        ctx.font =
            "11px Arial";

        ctx.textAlign =
            "center";

        ctx.fillText(
            "Waveform não disponível",
            largura / 2,
            altura / 2
        );

        return;
    }

    const larguraTotal =
        largura * 0.94;

    const margem =
        (
            largura -
            larguraTotal
        ) / 2;

    const passo =
        larguraTotal /
        waveform.length;

    const centroY =
        altura / 2;

    const indiceAtual =
        obterProgressoDaFala() *
        (
            waveform.length - 1
        );

    waveform.forEach(
        function(v, i) {

            const valor =
                Math.abs(v || 0);

            const h =
                Math.max(
                    4,
                    Math.min(
                        altura * 0.70,
                        valor *
                        altura *
                        1.55
                    )
                );

            const x =
                margem +
                i * passo;

            ctx.fillStyle =
                i <= indiceAtual
                    ?
                    "rgba(255,23,68,.92)"
                    :
                    "rgba(255,23,68,.28)";

            desenharBarraArredondada(
                ctx,
                x,
                centroY,
                Math.max(
                    2.5,
                    passo * 0.62
                ),
                h,
                6
            );
        }
    );
}


/* =========================================================
   WAVEFORM DA DUBLAGEM
   ========================================================= */

function desenharWaveformDublagem() {

    if (!canvasDub) {
        return;
    }

    const largura =
        canvasDub.clientWidth;

    const altura =
        canvasDub.clientHeight;

    ctxDub.clearRect(
        0,
        0,
        largura,
        altura
    );

    const waveform =
        waveformsDublagem[
            falaAtual
        ];

    if (
        !waveform ||
        !waveform.length
    ) {

        ctxDub.fillStyle =
            "rgba(255,255,255,.10)";

        ctxDub.font =
            "11px Arial";

        ctxDub.textAlign =
            "center";

        ctxDub.fillText(
            "Sua dublagem aparecerá aqui depois da gravação",
            largura / 2,
            altura / 2
        );

        return;
    }

    const larguraTotal =
        largura * 0.94;

    const margem =
        (
            largura -
            larguraTotal
        ) / 2;

    const passo =
        larguraTotal /
        waveform.length;

    const centroY =
        altura / 2;

    waveform.forEach(
        function(v, i) {

            const valor =
                Math.abs(v || 0);

            const h =
                Math.max(
                    3,
                    Math.min(
                        altura * 0.70,
                        valor *
                        altura *
                        1.7
                    )
                );

            const x =
                margem +
                i * passo;

            ctxDub.fillStyle =
                "rgba(255,23,68,.85)";

            desenharBarraArredondada(
                ctxDub,
                x,
                centroY,
                Math.max(
                    2.5,
                    passo * 0.62
                ),
                h,
                6
            );
        }
    );
}


/* =========================================================
   CRIAR WAVEFORM DA GRAVAÇÃO
   ========================================================= */

async function criarWaveformDaGravacao(
    blob
) {

    try {

        const ab =
            await blob.arrayBuffer();

        const AC =
            window.AudioContext ||
            window.webkitAudioContext;

        const ac =
            new AC();

        const buf =
            await ac.decodeAudioData(
                ab
            );

        const data =
            buf.getChannelData(0);

        const q =
            120;

        const bl =
            Math.floor(
                data.length / q
            );

        const wf = [];

        for (
            let i = 0;
            i < q;
            i++
        ) {

            let maior = 0;

            const inicio =
                i * bl;

            const fim =
                i === q - 1
                    ?
                    data.length
                    :
                    inicio + bl;

            for (
                let j = inicio;
                j < fim;
                j++
            ) {

                maior =
                    Math.max(
                        maior,
                        Math.abs(
                            data[j]
                        )
                    );
            }

            wf.push(maior);
        }

        const m =
            Math.max(
                ...wf,
                0.001
            );

        const out =
            wf.map(
                function(v) {
                    return v / m;
                }
            );

        await ac.close();

        return out;

    } catch (e) {

        console.error(e);

        return [];
    }
}


/* =========================================================
   PLAYHEAD
   ========================================================= */

function atualizarPlayhead() {

    if (!dados) {
        return;
    }

    const largura =
        canvas.clientWidth;

    const lw =
        largura * 0.94;

    const margem =
        (
            largura -
            lw
        ) / 2;

    const pos =
        margem +
        lw *
        obterProgressoDaFala();

    playhead.style.left =
        pos + "px";

    desenharWaveformDaFala();
}


function atualizarAnimacao() {

    if (!dados) {
        return;
    }

    atualizarPlayhead();

    if (
        !video.paused &&
        !video.ended
    ) {

        requestAnimationFrame(
            atualizarAnimacao
        );
    }
}


/* =========================================================
   EVENTOS DO VÍDEO
   ========================================================= */

video.addEventListener(
    "play",
    function() {

        requestAnimationFrame(
            atualizarAnimacao
        );
    }
);

video.addEventListener(
    "timeupdate",
    function() {

        atualizarPlayhead();

        if (gravando) {

            verificarFinalDaGravacao();

        } else if (ouvindo) {

            verificarFinalDaAudicao();

        } else {

            verificarFimDaFala();
        }
    }
);

video.addEventListener(
    "pause",
    function() {

        atualizarPlayhead();
    }
);


/* =========================================================
   GRAVAÇÃO
   ========================================================= */

async function marcarCenaGratisUsada() {
    try {
        if (!usuarioSupabase) {
            console.error("Usuário Supabase não encontrado.");
            return false;
        }

        // Se já pagou, todas as cenas estão liberadas.
        if (acessoUsuario && acessoUsuario.pagamento_confirmado === true) {
            return true;
        }

        // Se a cena grátis já foi usada
        if (acessoUsuario && acessoUsuario.cena_gratis_usada === true) {

            // Permite continuar somente na mesma cena escolhida anteriormente.
            if (acessoUsuario.cena_gratis_id === pastaCena) {
                console.log(
                    "Usuário está usando novamente a cena grátis escolhida:",
                    pastaCena
                );

                return true;
            }

            // Outra cena exige pagamento.
            console.log(
                "Cena bloqueada. Usuário já utilizou a cena grátis em:",
                acessoUsuario.cena_gratis_id
            );

            mostrarModalPagamento();
            return false;
        }

        // ---------------------------------------------------------
        // A partir daqui o usuário ainda NÃO utilizou a cena grátis.
        // Como já existe uma linha em acessos, fazemos UPDATE.
        // ---------------------------------------------------------

        const { data, error } = await supabaseDublagem
            .from("acessos")
            .update({
                cena_gratis_usada: true,
                cena_gratis_id: pastaCena,
                atualizado_em: new Date().toISOString()
            })
            .eq("usuario_id", usuarioSupabase.id)
            .select()
            .single();

        if (error) {
            console.error("Erro ao registrar cena grátis:", error);
            return false;
        }

        acessoUsuario = data;

        console.log(
            "Cena grátis registrada:",
            pastaCena
        );

        return true;

    } catch (erro) {
        console.error(
            "Erro inesperado ao registrar cena grátis:",
            erro
        );

        return false;
    }
}

async function iniciarGravacao() {

    if (!dados) {
        return;
    }

    pararAudioGravacao();

    try {

        const stream =
            await navigator
                .mediaDevices
                .getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    }
                });

        const acessoLiberado =
            await marcarCenaGratisUsada();

        if (!acessoLiberado) {

            stream
                .getTracks()
                .forEach(
                    function(t) {
                        t.stop();
                    }
                );

            return;
        }

        chunks = [];

        const indiceGravado =
            falaAtual;

        gravador =
            new MediaRecorder(
                stream
            );

        gravador.ondataavailable =
            function(e) {

                if (
                    e.data &&
                    e.data.size > 0
                ) {

                    chunks.push(
                        e.data
                    );
                }
            };

        gravador.onstop =
            async function() {

                const blob =
                    new Blob(
                        chunks,
                        {
                            type:
                                "audio/webm"
                        }
                    );

                if (
                    urlsDublagem[
                        indiceGravado
                    ] &&
                    urlsDublagem[
                        indiceGravado
                    ].startsWith("blob:")
                ) {

                    URL.revokeObjectURL(
                        urlsDublagem[
                            indiceGravado
                        ]
                    );
                }

                const url =
                    URL.createObjectURL(
                        blob
                    );

                gravacoes[
                    indiceGravado
                ] = blob;

                urlsDublagem[
                    indiceGravado
                ] = url;

                waveformsDublagem[
                    indiceGravado
                ] =
                    await criarWaveformDaGravacao(
                        blob
                    );

                stream
                    .getTracks()
                    .forEach(
                        function(t) {
                            t.stop();
                        }
                    );

                gravando = false;

                btnGravar.textContent =
                    "🎙️ Gravar";

                btnOuvir.disabled =
                    false;

                btnRegravar.disabled =
                    false;

                video.volume = 1;

                statusEl.textContent =
                    "Dublagem gravada. Ao ouvir esta fala, o áudio original ficará mudo.";

                desenharWaveformDublagem();

                atualizarListaFalas();

                atualizarBotoes();

                verificarTodasGravadas();

                await salvarGravacaoSupabase(
                    indiceGravado,
                    blob
                );
            };

        gravador.start();

        gravando = true;

        btnGravar.textContent =
            "⏹ Parar";

        btnOuvir.disabled =
            true;

        btnRegravar.disabled =
            true;

        video.volume =
            0.20;

        statusEl.textContent =
            "Gravando...";

        const fala =
            dados.falas[
                falaAtual
            ];

        video.currentTime =
            fala.inicio_original;

        video.play();

    } catch (e) {

        console.error(e);

        statusEl.textContent =
            "Não foi possível acessar o microfone.";
    }
}


function pararGravacao() {

    if (
        gravador &&
        gravador.state !== "inactive"
    ) {

        gravador.stop();
    }

    gravando = false;

    video.pause();

    video.volume = 1;

    atualizarPlayhead();
}


function alternarGravacao() {

    if (gravando) {

        pararGravacao();

    } else {

        iniciarGravacao();
    }
}


/* =========================================================
   OUVIR FALA
   ========================================================= */

function ouvirGravacao() {

    if (!dados) {
        return;
    }

    const fala =
        dados.falas[
            falaAtual
        ];

    if (!fala) {
        return;
    }

    pararAudioGravacao();

    video.pause();

    const temDub =
        !!gravacoes[
            falaAtual
        ];

    video.currentTime =
        fala.inicio_original;

    if (temDub) {

        video.volume = 0;

        audioPlayer =
            new Audio(
                urlsDublagem[
                    falaAtual
                ]
            );

        audioPlayer.volume = 1;

    } else {

        video.volume = 1;

        audioPlayer = null;
    }

    ouvindo = true;

    btnOuvir.textContent =
        "⏹ Parar";

    statusEl.textContent =
        temDub
            ?
            "Reproduzindo sua dublagem. O áudio original está mudo."
            :
            "Reproduzindo o áudio original desta fala.";

    const iniciar =
        function() {

            if (!ouvindo) {
                return;
            }

            video.play();

            if (audioPlayer) {

                audioPlayer
                    .play()
                    .catch(
                        console.error
                    );
            }
        };

    video.addEventListener(
        "seeked",
        iniciar,
        {
            once: true
        }
    );

    if (
        Math.abs(
            video.currentTime -
            fala.inicio_original
        ) < 0.05
    ) {

        iniciar();
    }

    if (audioPlayer) {

        audioPlayer.onended =
            function() {

                finalizarAudicao();
            };
    }
}


function finalizarAudicao() {

    if (audioPlayer) {

        audioPlayer.pause();

        audioPlayer.currentTime =
            0;

        audioPlayer.onended =
            null;
    }

    video.pause();

    video.volume =
        1;

    ouvindo =
        false;

    btnOuvir.textContent =
        "▶ Ouvir fala";

    statusEl.textContent =
        "Reprodução concluída.";

    if (
        dados &&
        dados.falas[
            falaAtual
        ]
    ) {

        video.currentTime =
            dados.falas[
                falaAtual
            ].inicio_original;
    }

    atualizarPlayhead();

    atualizarBotoes();
}


function verificarFinalDaAudicao() {

    if (
        !ouvindo ||
        !dados
    ) {
        return;
    }

    const fala =
        dados.falas[
            falaAtual
        ];

    if (
        video.currentTime >=
        fala.fim_original
    ) {

        finalizarAudicao();
    }
}


function pararAudioGravacao() {

    const estava =
        ouvindo;

    if (audioPlayer) {

        audioPlayer.pause();

        audioPlayer.currentTime =
            0;

        audioPlayer.onended =
            null;

        audioPlayer = null;
    }

    ouvindo =
        false;

    video.volume =
        1;

    if (estava) {

        video.pause();

        statusEl.textContent =
            "Reprodução parada.";
    }

    btnOuvir.textContent =
        "▶️ Ouvir fala";

    btnOuvir.disabled =
        !dados ||
        !dados.falas[
            falaAtual
        ];
}


/* =========================================================
   REGRAVAR
   ========================================================= */

async function regravar() {

    pararAudioGravacao();

    if (gravando) {
        pararGravacao();
    }

    const indiceRemovido =
        falaAtual;

    if (
        urlsDublagem[
            indiceRemovido
        ] &&
        urlsDublagem[
            indiceRemovido
        ].startsWith("blob:")
    ) {

        URL.revokeObjectURL(
            urlsDublagem[
                indiceRemovido
            ]
        );
    }

    gravacoes[
        indiceRemovido
    ] = null;

    urlsDublagem[
        indiceRemovido
    ] = null;

    waveformsDublagem[
        indiceRemovido
    ] = null;

    btnOuvir.disabled =
        false;

    btnRegravar.disabled =
        true;

    const fala =
        dados.falas[
            falaAtual
        ];

    video.pause();

    video.volume =
        1;

    video.currentTime =
        fala.inicio_original;

    desenharWaveformDublagem();

    atualizarPlayhead();

    atualizarListaFalas();

    verificarTodasGravadas();

    statusEl.textContent =
        "A dublagem foi removida. Esta fala voltou a usar o áudio original.";

    await removerGravacaoSupabase(
        indiceRemovido
    );
}


/* =========================================================
   FINAL DA GRAVAÇÃO
   ========================================================= */

function verificarFinalDaGravacao() {

    if (
        !gravando ||
        !dados
    ) {
        return;
    }

    const fala =
        dados.falas[
            falaAtual
        ];

    if (
        video.currentTime >=
        fala.fim_original
    ) {

        pararGravacao();
    }
}


/* =========================================================
   FINAL DA FALA
   ========================================================= */

function verificarFimDaFala() {

    if (
        !dados ||
        gravando ||
        ouvindo
    ) {
        return;
    }

    const fala =
        dados.falas[
            falaAtual
        ];

    if (
        video.currentTime >=
        fala.fim_original
    ) {

        video.pause();

        video.volume =
            1;

        video.currentTime =
            fala.inicio_original;

        atualizarPlayhead();
    }
}


/* =========================================================
   PRÓXIMA FALA
   ========================================================= */

function proximaFala() {

    if (!dados) {
        return;
    }

    if (gravando) {
        pararGravacao();
    }

    if (ouvindo) {
        pararAudioGravacao();
    }

    if (
        falaAtual <
        dados.falas.length - 1
    ) {

        selecionarFala(
            falaAtual + 1
        );
    }
}


/* =========================================================
   FALA ANTERIOR
   ========================================================= */

function falaAnterior() {

    if (!dados) {
        return;
    }

    if (gravando) {
        pararGravacao();
    }

    if (ouvindo) {
        pararAudioGravacao();
    }

    if (falaAtual > 0) {

        selecionarFala(
            falaAtual - 1
        );
    }
}


/* =========================================================
   BOTÕES
   ========================================================= */

function atualizarBotoes() {

    btnAnterior.disabled =
        falaAtual <= 0;

    btnProxima.disabled =
        !dados ||
        falaAtual >=
        dados.falas.length - 1;

    if (!gravando) {

        btnGravar.disabled =
            false;
    }
}


/* =========================================================
   VERIFICAR SE TODAS AS FALAS FORAM GRAVADAS
   ========================================================= */

function verificarTodasGravadas() {

    if (!dados || !btnBaixar) {
        return;
    }

    const todas =
        gravacoes.every(
            g =>
                g !== null
        );

    if (todas) {

        btnBaixar.style.display =
            "inline-block";

        statusEl.textContent =
            "Todas as falas foram gravadas! Você pode baixar sua dublagem.";

    } else {

        btnBaixar.style.display =
            "none";
    }
}


/* =========================================================
   OBTER BLOB DA GRAVAÇÃO
   ========================================================= */

/*
   Se a gravação foi feita agora:
      gravacoes[index] = Blob

   Se foi carregada do Supabase:
      gravacoes[index] = true

   Nesse segundo caso, baixamos novamente
   através da URL assinada.
*/

async function obterBlobDaGravacao(index) {

    const gravacao =
        gravacoes[index];

    if (
        gravacao instanceof Blob
    ) {

        return gravacao;
    }

    const url =
        urlsDublagem[index];

    if (!url) {

        throw new Error(
            `Não existe URL para a gravação ${index + 1}.`
        );
    }

    const resposta =
        await fetch(url);

    if (!resposta.ok) {

        throw new Error(
            `Não foi possível baixar a gravação ${index + 1}.`
        );
    }

    return await resposta.blob();
}


/* =========================================================
   BAIXAR DUBLAGEM — FFMPEG LOCAL
   ========================================================= */

async function baixarDublagem() {

    if (!dados) {
        return;
    }

    const todas =
        gravacoes.every(
            g =>
                g !== null
        );

    if (!todas) {

        statusEl.textContent =
            "Você ainda precisa gravar todas as falas.";

        return;

    }

    try {

        statusEl.textContent =
            "Carregando FFmpeg... Aguarde.";

        btnBaixar.disabled =
            true;

        if (!ffmpegCarregado) {

            const {
                FFmpeg
            } = FFmpegWASM;

            ffmpeg =
                new FFmpeg();

            const coreURL =
                new URL(
                    "ferramenta/ffmpeg/ffmpeg-core.js",
                    document.baseURI
                ).href;

            const wasmURL =
                new URL(
                    "ferramenta/ffmpeg/ffmpeg-core.wasm",
                    document.baseURI
                ).href;

            await ffmpeg.load({
                coreURL,
                wasmURL
            });

            ffmpegCarregado =
                true;
        }

        statusEl.textContent =
            "Carregando vídeo original...";

        const videoResponse =
            await fetch(
                video.src
            );

        if (!videoResponse.ok) {

            throw new Error(
                "Não foi possível carregar o vídeo original."
            );
        }

        const videoData =
            await videoResponse.arrayBuffer();

        await ffmpeg.writeFile(
            "video.mp4",
            new Uint8Array(
                videoData
            )
        );


        /* =================================================
           CARREGAR TODAS AS GRAVAÇÕES
           ================================================= */

        for (
            let i = 0;
            i < gravacoes.length;
            i++
        ) {

            statusEl.textContent =
                `Preparando gravação ${i + 1} de ${gravacoes.length}...`;

            const blob =
                await obterBlobDaGravacao(i);

            const ab =
                await blob.arrayBuffer();

            await ffmpeg.writeFile(
                `audio${i}.webm`,
                new Uint8Array(ab)
            );
        }


        /* =================================================
           MONTAR FILTRO DE ÁUDIO
           ================================================= */

        let filterComplex =
            "";

        let inputs =
            "[0:a]";

        for (
            let i = 0;
            i < gravacoes.length;
            i++
        ) {

            const delayMs =
                Math.round(
                    dados.falas[i]
                        .inicio_original *
                    1000
                );

            filterComplex +=
                `[${i + 1}:a]` +
                `adelay=${delayMs}|${delayMs}` +
                `[a${i}];`;

            inputs +=
                `[a${i}]`;
        }

        filterComplex +=
            `${inputs}amix=inputs=${gravacoes.length + 1}:duration=longest[aout]`;


        /* =================================================
           ARGUMENTOS DO FFMPEG
           ================================================= */

        const args = [
            "-i",
            "video.mp4"
        ];

        for (
            let i = 0;
            i < gravacoes.length;
            i++
        ) {

            args.push(
                "-i",
                `audio${i}.webm`
            );
        }

        args.push(
            "-filter_complex",
            filterComplex,

            "-map",
            "0:v",

            "-map",
            "[aout]",

            "-c:v",
            "copy",

            "-c:a",
            "aac",

            "-shortest",

            "saida.mp4"
        );


        /* =================================================
           EXECUTAR FFMPEG
           ================================================= */

        statusEl.textContent =
            "Gerando vídeo... Isso pode demorar um pouco.";

        await ffmpeg.exec(
            args
        );


        /* =================================================
           LER VÍDEO GERADO
           ================================================= */

        const data =
            await ffmpeg.readFile(
                "saida.mp4"
            );

        const blob =
            new Blob(
                [
                    data.buffer
                ],
                {
                    type:
                        "video/mp4"
                }
            );

        const url =
            URL.createObjectURL(
                blob
            );

        const a =
            document.createElement(
                "a"
            );

        a.href =
            url;

        a.download =
            `dublagem-${pastaCena}.mp4`;

        document.body.appendChild(a);

        a.click();

        a.remove();

        setTimeout(
            function() {
                URL.revokeObjectURL(url);
            },
            1000
        );

        statusEl.textContent =
            "Download iniciado! Seu vídeo está pronto.";

        btnBaixar.disabled =
            false;

    } catch (erro) {

        console.error(
            "Erro ao gerar dublagem:",
            erro
        );

        statusEl.textContent =
            "Erro ao gerar o vídeo. Tente novamente.";

        btnBaixar.disabled =
            false;
    }
}


/* =========================================================
   TECLADO
   ========================================================= */

document.addEventListener(
    "keydown",
    function(e) {

        if (
            e.code === "Space" &&
            document.activeElement.tagName !== "BUTTON" &&
            document.activeElement.tagName !== "INPUT" &&
            document.activeElement.tagName !== "TEXTAREA"
        ) {

            e.preventDefault();

            alternarGravacao();
        }

        if (
            e.key === "ArrowRight"
        ) {

            proximaFala();
        }

        if (
            e.key === "ArrowLeft"
        ) {

            falaAnterior();
        }
    }
);


/* =========================================================
   CONECTAR BOTÕES
   ========================================================= */

if (btnGravar) {

    btnGravar.addEventListener(
        "click",
        alternarGravacao
    );
}

if (btnOuvir) {

    btnOuvir.addEventListener(
        "click",
        function() {

            if (ouvindo) {

                finalizarAudicao();

            } else {

                ouvirGravacao();
            }
        }
    );
}

if (btnRegravar) {

    btnRegravar.addEventListener(
        "click",
        regravar
    );
}

if (btnAnterior) {

    btnAnterior.addEventListener(
        "click",
        falaAnterior
    );
}

if (btnProxima) {

    btnProxima.addEventListener(
        "click",
        proximaFala
    );
}

if (btnBaixar) {

    btnBaixar.addEventListener(
        "click",
        baixarDublagem
    );
}


/* =========================================================
   INICIAR MOTOR
   ========================================================= */

carregarCena();