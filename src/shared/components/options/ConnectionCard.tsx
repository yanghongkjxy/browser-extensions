import * as React from 'react'
import {
    Alert,
    Badge,
    Button,
    Card,
    CardBody,
    CardHeader,
    Col,
    FormGroup,
    FormText,
    Input,
    InputGroup,
    ListGroupItemHeading,
    Row,
} from 'reactstrap'
import * as permissions from '../../../browser/permissions'
import storage from '../../../browser/storage'
import { StorageItems } from '../../../browser/types'
import { GQL } from '../../../types/gqlschema'
import { fetchSite } from '../../backend/server'
import { DEFAULT_SOURCEGRAPH_URL, isSourcegraphDotCom, setSourcegraphUrl, sourcegraphUrl } from '../../util/context'

interface Props {
    currentUser: GQL.IUser | undefined
    storage: StorageItems
    permissionOrigins: string[]
}

interface State {
    site?: GQL.ISite
    isUpdatingURL: boolean
    sourcegraphUrl: string
    error: boolean
}

export class ConnectionCard extends React.Component<Props, State> {
    private urlInput: HTMLInputElement | null
    private contentScriptUrls: string[]

    constructor(props: Props) {
        super(props)
        this.state = {
            sourcegraphUrl,
            isUpdatingURL: false,
            error: false,
        }
    }

    private setContentScriptUrls(props: Props): void {
        this.contentScriptUrls = [...props.storage.clientConfiguration.contentScriptUrls, props.storage.sourcegraphURL]
    }

    public componentDidMount(): void {
        this.setContentScriptUrls(this.props)
        this.checkConnection()
    }

    public componentWillReceiveProps(nextProps: Props): void {
        this.setContentScriptUrls(nextProps)
    }

    private serverStatusText = (): JSX.Element => {
        const { site } = this.state
        if (!site) {
            return <Badge color="danger">Unable to Connect</Badge>
        }
        if (isSourcegraphDotCom()) {
            return <Badge color="warning">Limited Functionality</Badge>
        }
        return <Badge color="success">Connected</Badge>
    }

    private requestPermissions = (): void => {
        permissions.request(this.contentScriptUrls).then(
            () => {
                /** noop */
            },
            () => {
                /** noop */
            }
        )
    }

    private cancelButtonClicked = (): void => {
        this.setState(() => ({ isUpdatingURL: false }))
        if (!this.urlInput) {
            return
        }
        this.setState({ sourcegraphUrl })
        this.urlInput.blur()
    }

    private updateRef = (ref: HTMLInputElement | null): void => {
        this.urlInput = ref
    }

    private onFormSubmit = (event: React.FormEvent<HTMLElement>): void => {
        event.preventDefault()

        this.saveNewUrl()
    }

    private saveNewUrl(): void {
        try {
            // If there is no url in the input use https://sourcegraph.com.
            const url = new URL(this.state.sourcegraphUrl || DEFAULT_SOURCEGRAPH_URL)
            // (TODO): Remove serverUrl setting after release.
            storage.setSync({ sourcegraphURL: url.origin, serverUrls: [url.origin] })
            setSourcegraphUrl(url.origin)
            this.checkConnection()
            this.setState({ sourcegraphUrl: url.origin, isUpdatingURL: false, error: false })
        } catch {
            this.handleInvalidUrl()
        }
    }

    private handleInvalidUrl = (): void => {
        this.setState(
            () => ({ error: true }),
            () => {
                setTimeout(() => this.setState({ error: false }), 2000)
            }
        )
    }

    private handleURLChanged = (e: React.ChangeEvent<HTMLInputElement>): void => {
        this.setState({ sourcegraphUrl: e.target.value })
    }

    private checkConnection = (): void => {
        fetchSite().subscribe(
            site => {
                this.setState(() => ({ site }))
            },
            () => {
                this.setState(() => ({ site: undefined }))
            }
        )
    }

    public render(): JSX.Element | null {
        return (
            <Row className="pb-3">
                <Col>
                    <Card>
                        <CardHeader>Sourcegraph Configuration</CardHeader>
                        <CardBody>
                            <Col className="px-0">
                                <ListGroupItemHeading>Server Connection</ListGroupItemHeading>
                                <form onSubmit={this.onFormSubmit}>
                                    <FormGroup>
                                        <InputGroup>
                                            <Input
                                                invalid={!!this.state.error}
                                                type="url"
                                                required={true}
                                                innerRef={this.updateRef}
                                                defaultValue={sourcegraphUrl}
                                                onChange={this.handleURLChanged}
                                            />
                                            <div>
                                                <Button
                                                    color="primary"
                                                    className="btn btn-primary"
                                                    type="submit"
                                                    disabled={this.state.sourcegraphUrl !== sourcegraphUrl}
                                                >
                                                    Save
                                                </Button>
                                                <Button
                                                    onClick={this.cancelButtonClicked}
                                                    color="secondary"
                                                    className="btn btn-secondary"
                                                    disabled={this.state.sourcegraphUrl !== sourcegraphUrl}
                                                >
                                                    Cancel
                                                </Button>
                                            </div>
                                        </InputGroup>
                                        {this.state.error && (
                                            <FormText color="muted">Please enter a valid URL.</FormText>
                                        )}
                                    </FormGroup>
                                </form>
                                <ListGroupItemHeading className="pt-3">
                                    Status: {this.serverStatusText()}
                                    <Button
                                        onClick={this.checkConnection}
                                        size="sm"
                                        color="secondary"
                                        className="float-right"
                                    >
                                        Check Connection
                                    </Button>
                                </ListGroupItemHeading>
                                {this.sourcegraphServerAlert()}
                            </Col>
                        </CardBody>
                    </Card>
                </Col>
            </Row>
        )
    }

    private sourcegraphServerAlert = (): JSX.Element => {
        const { permissionOrigins } = this.props
        if (isSourcegraphDotCom()) {
            return (
                <div className="pt-2">
                    <Alert color="warning">Add a Server URL to enable support on private code.</Alert>
                </div>
            )
        }

        const { site } = this.state
        if (!site) {
            return (
                <div className="pt-2">
                    <Alert color="danger">
                        Error connecting to Server. Ensure you are authenticated and that the URL is correct.
                    </Alert>
                </div>
            )
        }
        const forbiddenUrls = permissionOrigins.includes('<all_urls>')
            ? []
            : this.contentScriptUrls.filter(url => !permissionOrigins.includes(`${url}/*`))
        if (forbiddenUrls.length !== 0) {
            return (
                <div className="pt-2">
                    <Alert color="warning">
                        {`Missing content script permissions: ${forbiddenUrls.join(', ')}.`}
                        <div className="pt-2">
                            <Button
                                onClick={this.requestPermissions}
                                color="primary"
                                className="btn btn-secondary btn-sm"
                                size="sm"
                            >
                                Grant permissions
                            </Button>
                        </div>
                    </Alert>
                </div>
            )
        }

        if (!site.hasCodeIntelligence) {
            const isSiteAdmin = this.props.currentUser && this.props.currentUser.siteAdmin
            return (
                <div className="pt-2">
                    <Alert color="info">
                        {!isSiteAdmin &&
                            `Code intelligence is not enabled. Contact your site admin to enable language servers. Code
                        intelligence is available for open source repositories.`}
                        {isSiteAdmin && (
                            <div>
                                Code intelligence is disabled. Enable code intelligence for jump to definition, hover
                                tooltips, and find references.
                                <div className="pt-2">
                                    <Button
                                        href={`${sourcegraphUrl}/site-admin/code-intelligence`}
                                        color="primary"
                                        className="btn btn-secondary btn-sm"
                                        size="sm"
                                    >
                                        Enable Code Intellligence
                                    </Button>
                                </div>
                            </div>
                        )}
                    </Alert>
                </div>
            )
        }

        return (
            <div className="pt-2">
                <Alert color="success">
                    You are connected to your server and code intelligence is fully functional.
                    <div className="pt-2">
                        <Button href={sourcegraphUrl} color="primary" className="btn btn-secondary btn-sm" size="sm">
                            Open Sourcegraph
                        </Button>
                    </div>
                </Alert>
            </div>
        )
    }
}
